/* FHAssistant demo — Identify Respondents and Key Records Collection.
 *
 * Static-hosting constraint: there is no backend, so the page calls the AI
 * API (Anthropic or OpenAI, chosen by the pasted key's prefix) directly from
 * the presenter's browser. The access key is pasted
 * once via "Demo setup", lives in this browser's localStorage only, and is
 * never present in this repository. */

/* Provider is chosen by the pasted key's prefix: "sk-ant-…" calls Anthropic,
 * any other "sk-…" key calls OpenAI. */
var ANTHROPIC_MODEL = "claude-opus-5";
var OPENAI_MODEL = "gpt-5";
var KEY_STORAGE = "fha_demo_key";

var SYSTEM_PROMPT = `You are FHAssistant, an investigation-support assistant for fair housing investigators, built by fair housing advocates. This deployment is the "Identify Respondents and Key Records Collection" module, running in a DEMONSTRATION environment for a national training of fair housing investigators.

Demonstration ground rules:
- All case data you receive is fictional training data. Work it like a real case, but never present simulated findings as genuine records.
- You do not have live access to assessor, recorder, Secretary of State, licensing, or complaint databases. Where a production deployment would query them, produce realistic, clearly fictional illustrative results and label that section "(simulated for demonstration)".
- If someone appears to enter real personal case information, briefly remind them this is a demonstration environment and proceed only with fictional data.

The first user message is a completed intake for this module. Respond with the "Respondent Identification - Property Owner & Operator Information Report", in Markdown, structured as:
1. Case header - case number, complainant, subject property, basis and issues (a compact table is ideal).
2. Respondents identified - a table of likely respondents: owner of record, corporate parents/members, management company, on-site agents, and any other parties the allegations implicate; for each, their role and why they are a proper respondent.
3. Property and ownership research (simulated for demonstration) - the county assessor/recorder and Secretary of State searches a production run would execute, with illustrative results (parcel, deed history, entity registration, registered agent).
4. Licensing and regulatory profile (simulated for demonstration) - real-estate licenses, business licenses, and other regulators relevant to the parties.
5. Prior complaint history (simulated for demonstration) - the HUD FHEO and state civil-rights agency search approach with illustrative results.
6. Key records collection plan - a prioritized table: record, custodian agency, what it establishes for this investigation, how to request it.

Keep the report tight enough to present live: roughly 500-800 words, headed sections, tables where indicated.

End every report with exactly this offer:

**Would you like me to generate draft emails for you to review and send to any of the following agencies, requesting public records about a respondent identified in this report?** Pick an agency below (or ask in your own words) and I will prepare a draft email you can edit and send:
- HUD FHEO - prior discrimination complaints
- State FHAP (state civil rights department) - prior discrimination complaints
- State regulators: Real Estate Division (licensing and complaints) / Insurance Department / Design and Construction (architects, contractors) / Banking Department (registration, audits, complaints)
- Federal regulators: lenders / appraisers / SEC filings
- Local: code enforcement / police / fire / zoning / business licensing

When asked for a draft email to an agency: produce one complete, professional, ready-to-edit email - To, Subject, Body - requesting the specific records about the named respondent(s). Cite the correct authority: the state public records act for state and local agencies (for California, the California Public Records Act, Gov. Code section 7920.000 et seq.), and FOIA, 5 U.S.C. section 552, for federal agencies; note where HUD FHEO complaint files require a FOIA request and what is commonly exempt. Use square-bracket placeholders for the investigator's name, title, organization, and contact details. Keep it under roughly 300 words, and put the entire email in a fenced code block so it is easy to copy.

For any other follow-up, answer as a knowledgeable fair-housing investigation colleague: practical, specific to the case in context, and clear about what a production (non-demonstration) deployment would do differently. Do not pad responses with repeated disclaimers.`;

var AGENCIES = [
  "HUD FHEO — prior discrimination complaints",
  "State FHAP (Civil Rights Dept.) — prior complaints",
  "Real Estate Division — licensing & complaints",
  "Insurance Department — licensing & complaints",
  "Design & Construction (architects, contractors)",
  "Banking Department — registration, audits, complaints",
  "Federal lender regulators",
  "Federal appraisal regulators",
  "SEC filings",
  "Code Enforcement",
  "Police Department",
  "Fire Department",
  "Zoning / Planning",
  "Business Licensing",
];

var SAMPLE = {
  "f-case": "FH-2026-0142",
  "f-complainant": "Marisol Vega",
  "f-property": "Cypress Grove Apartments, 1428 Alder Court, Sacramento, CA 95811",
  "f-type": "48-unit garden-style apartment complex (built 2004)",
  "f-owner": "Bayline Properties LLC",
  "f-operator": "Golden State Residential Management, Inc. (on-site manager: Dan Kowalski)",
  "f-parties": "Leasing agent \"Tricia\" (last name unknown); towing contractor that removed complainant's vehicle",
  "f-basis": "Disability — denial of reasonable accommodation (assigned accessible parking space near unit); subsequent 3-day notice alleged to be retaliatory.",
  "f-notes": "Complainant uses a mobility aid. Two other tenants reportedly had similar accommodation requests denied. Complainant has copies of two written requests and the denial email.",
};

var conversation = [];
var busy = false;
var pendingRun = false;

/* ---------- Demo setup (access key) ---------- */

function getKey() { return localStorage.getItem(KEY_STORAGE) || ""; }

function openSetup() {
  document.getElementById("setup-key").value = getKey();
  document.getElementById("setup-backdrop").classList.remove("hidden");
  document.getElementById("setup-key").focus();
}

function closeSetup() {
  document.getElementById("setup-backdrop").classList.add("hidden");
  pendingRun = false;
}

function saveSetup() {
  var v = document.getElementById("setup-key").value.trim();
  if (v) localStorage.setItem(KEY_STORAGE, v);
  else localStorage.removeItem(KEY_STORAGE);
  document.getElementById("setup-backdrop").classList.add("hidden");
  if (pendingRun && getKey()) {
    pendingRun = false;
    runReport();
  }
}

/* ---------- Model APIs (streaming; provider chosen by key prefix) ---------- */

function callModel(messages, handlers) {
  return getKey().indexOf("sk-ant-") === 0
    ? callAnthropic(messages, handlers)
    : callOpenAI(messages, handlers);
}

function friendlyHttpError(status, detail) {
  if (status === 401) return "The access key was rejected. Open Demo setup (top right) and re-enter it.";
  if (status === 429) return "Rate limited — wait a few seconds and try again.";
  if (status === 529) return "The AI service is briefly overloaded — try again in a moment.";
  return "Request failed (" + status + ")" + (detail ? ": " + detail : ".");
}

async function callAnthropic(messages, handlers) {
  var res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": getKey(),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      // Safety-classifier declines re-route server-side instead of surfacing.
      "anthropic-beta": "server-side-fallback-2026-07-01",
      // Required for direct browser calls; acceptable here because the key is
      // the presenter's own, entered at runtime — never shipped with the page.
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      // Hard cap on per-turn spend during a live demo.
      max_tokens: 16000,
      // Latency tuning for a live audience; raise to "high" for deeper reports.
      output_config: { effort: "medium" },
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      stream: true,
      messages: messages,
    }),
  });

  if (!res.ok) {
    var detail = "";
    try {
      var j = await res.json();
      detail = (j.error && j.error.message) || "";
    } catch (e) { /* non-JSON error body */ }
    throw new Error(friendlyHttpError(res.status, detail));
  }

  var reader = res.body.getReader();
  var decoder = new TextDecoder();
  var buf = "";
  var stopReason = null;

  for (;;) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buf += decoder.decode(chunk.value, { stream: true });
    var nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      var line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (line.indexOf("data:") !== 0) continue;
      var payload = line.slice(5).trim();
      if (!payload) continue;
      var ev;
      try { ev = JSON.parse(payload); } catch (e) { continue; }
      if (ev.type === "content_block_start" && ev.content_block && ev.content_block.type === "thinking") {
        handlers.onThinking();
      } else if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") {
        handlers.onText(ev.delta.text);
      } else if (ev.type === "message_delta" && ev.delta && ev.delta.stop_reason) {
        stopReason = ev.delta.stop_reason;
      } else if (ev.type === "error") {
        throw new Error("The AI service reported an error: " + ((ev.error && ev.error.message) || "unknown") + ". Try again.");
      }
    }
  }
  return stopReason;
}

async function callOpenAI(messages, handlers) {
  // Reasoning models produce nothing visible while they think.
  handlers.onThinking();
  var res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + getKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      // Hard cap on per-turn spend during a live demo (includes reasoning).
      max_completion_tokens: 16000,
      // Latency tuning for a live audience; raise to "medium" for deeper reports.
      reasoning_effort: "low",
      stream: true,
      messages: [{ role: "system", content: SYSTEM_PROMPT }].concat(messages),
    }),
  });

  if (!res.ok) {
    var detail = "";
    try {
      var j = await res.json();
      detail = (j.error && j.error.message) || "";
    } catch (e) { /* non-JSON error body */ }
    throw new Error(friendlyHttpError(res.status, detail));
  }

  var reader = res.body.getReader();
  var decoder = new TextDecoder();
  var buf = "";
  var stopReason = null;

  for (;;) {
    var chunk = await reader.read();
    if (chunk.done) break;
    buf += decoder.decode(chunk.value, { stream: true });
    var nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      var line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (line.indexOf("data:") !== 0) continue;
      var payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      var ev;
      try { ev = JSON.parse(payload); } catch (e) { continue; }
      if (ev.error) {
        throw new Error("The AI service reported an error: " + (ev.error.message || "unknown") + ". Try again.");
      }
      var choice = ev.choices && ev.choices[0];
      if (!choice) continue;
      if (choice.delta && choice.delta.content) handlers.onText(choice.delta.content);
      if (choice.finish_reason) {
        // Map to the Anthropic-style values streamTurn() already handles.
        stopReason = choice.finish_reason === "length" ? "max_tokens"
          : choice.finish_reason === "content_filter" ? "refusal"
          : "end_turn";
      }
    }
  }
  return stopReason;
}

/* ---------- Minimal Markdown renderer (HTML-escaped) ---------- */

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function inlineMd(s) {
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return s;
}

function renderTable(rows) {
  var cells = rows.map(function (r) {
    return r.replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); });
  });
  var hasHeader = rows.length > 1 && /^[\s|:\-]+$/.test(rows[1]);
  var html = "<div class=\"table-wrap\"><table>";
  var start = 0;
  if (hasHeader) {
    html += "<thead><tr>" + cells[0].map(function (c) {
      return "<th>" + inlineMd(escapeHtml(c)) + "</th>";
    }).join("") + "</tr></thead>";
    start = 2;
  }
  html += "<tbody>";
  for (var r = start; r < cells.length; r++) {
    html += "<tr>" + cells[r].map(function (c) {
      return "<td>" + inlineMd(escapeHtml(c)) + "</td>";
    }).join("") + "</tr>";
  }
  return html + "</tbody></table></div>";
}

function renderMarkdown(src) {
  var lines = src.split("\n");
  var out = [];
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];

    if (/^```/.test(line)) {
      var code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++;
      out.push("<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>");
      continue;
    }
    if (/^\s*$/.test(line)) { i++; continue; }

    var h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      var lvl = Math.min(h[1].length, 4);
      out.push("<h" + lvl + ">" + inlineMd(escapeHtml(h[2])) + "</h" + lvl + ">");
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push("<hr>"); i++; continue; }

    if (/^\s*\|/.test(line)) {
      var rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i].trim()); i++; }
      out.push(renderTable(rows));
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      var items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      out.push("<ul>" + items.map(function (t) { return "<li>" + inlineMd(escapeHtml(t)) + "</li>"; }).join("") + "</ul>");
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      var oitems = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        oitems.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push("<ol>" + oitems.map(function (t) { return "<li>" + inlineMd(escapeHtml(t)) + "</li>"; }).join("") + "</ol>");
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      var q = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        q.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push("<blockquote>" + inlineMd(escapeHtml(q.join(" "))) + "</blockquote>");
      continue;
    }

    var para = [line];
    i++;
    while (i < lines.length && !/^\s*$/.test(lines[i]) &&
           !/^(#{1,6}\s|```|\s*\||\s*[-*]\s+|\s*\d+\.\s+|\s*>)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    out.push("<p>" + inlineMd(escapeHtml(para.join(" "))) + "</p>");
  }
  return out.join("");
}

/* ---------- Chat UI ---------- */

function addUserMsg(text) {
  var wrap = document.createElement("div");
  wrap.className = "msg user";
  var who = document.createElement("div");
  who.className = "who";
  who.textContent = "Investigator";
  var body = document.createElement("div");
  body.className = "body";
  body.textContent = text;
  wrap.appendChild(who);
  wrap.appendChild(body);
  document.getElementById("chat").appendChild(wrap);
  wrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

function addAssistantMsg() {
  var wrap = document.createElement("div");
  wrap.className = "msg assistant";
  wrap.innerHTML =
    "<div class=\"who\">FHAssistant</div>" +
    "<div class=\"status-line\">Contacting FHAssistant…</div>" +
    "<div class=\"md\"></div>";
  document.getElementById("chat").appendChild(wrap);
  return {
    wrap: wrap,
    status: wrap.querySelector(".status-line"),
    body: wrap.querySelector(".md"),
  };
}

function showError(message) {
  var area = document.getElementById("error-area");
  area.innerHTML = "";
  var box = document.createElement("div");
  box.className = "error-box";
  box.textContent = message;
  area.appendChild(box);
}

function clearError() { document.getElementById("error-area").innerHTML = ""; }

function setControls() {
  document.getElementById("run-btn").disabled = busy;
  document.getElementById("send-btn").disabled = busy;
  document.getElementById("followup-input").disabled = busy;
  var chips = document.querySelectorAll(".chip");
  for (var i = 0; i < chips.length; i++) chips[i].disabled = busy;
}

async function streamTurn() {
  busy = true;
  setControls();
  clearError();

  var el = addAssistantMsg();
  var text = "";
  try {
    var stopReason = await callModel(conversation, {
      onThinking: function () { el.status.textContent = "FHAssistant is analyzing the case…"; },
      onText: function (t) {
        if (!text) el.status.classList.add("hidden");
        text += t;
        el.body.innerHTML = renderMarkdown(text);
      },
    });
    el.status.classList.add("hidden");

    if (stopReason === "refusal" && !text) {
      el.wrap.remove();
      conversation.pop();
      showError("FHAssistant declined this request (safety review). Rephrase and try again.");
    } else {
      conversation.push({ role: "assistant", content: text || "(no response)" });
      if (stopReason === "max_tokens") {
        showError("The response hit the demo's length cap and may be truncated. Ask FHAssistant to continue if needed.");
      }
      document.getElementById("followup-area").classList.remove("hidden");
    }
  } catch (e) {
    el.wrap.remove();
    conversation.pop(); // the failed user turn — so a retry doesn't duplicate it
    showError(e.message || "Something went wrong. Try again.");
  } finally {
    busy = false;
    setControls();
  }
}

/* ---------- Intake ---------- */

function fieldVal(id) {
  var v = document.getElementById(id).value.trim();
  return v || "Not provided";
}

function buildIntake() {
  return [
    "New intake for the Identify Respondents and Key Records Collection module.",
    "",
    "Case number: " + fieldVal("f-case"),
    "Complainant: " + fieldVal("f-complainant"),
    "Subject property: " + fieldVal("f-property"),
    "Property type / size: " + fieldVal("f-type"),
    "Known owner: " + fieldVal("f-owner"),
    "Known operator / property manager: " + fieldVal("f-operator"),
    "Other known parties: " + fieldVal("f-parties"),
    "Alleged basis and issues: " + fieldVal("f-basis"),
    "Investigator notes: " + fieldVal("f-notes"),
    "",
    "Please run the respondent identification and produce the Property Owner & Operator Information Report.",
  ].join("\n");
}

function runReport() {
  if (busy) return;
  if (!getKey()) {
    pendingRun = true;
    openSetup();
    return;
  }
  document.getElementById("chat-panel").classList.remove("hidden");
  var intake = buildIntake();
  addUserMsg(intake);
  conversation.push({ role: "user", content: intake });
  streamTurn();
}

function sendFollowup(text) {
  if (busy || !text.trim()) return;
  addUserMsg(text.trim());
  conversation.push({ role: "user", content: text.trim() });
  streamTurn();
}

/* ---------- Wiring ---------- */

document.getElementById("intake-form").addEventListener("submit", function (e) {
  e.preventDefault();
  runReport();
});

document.getElementById("sample-btn").addEventListener("click", function () {
  for (var id in SAMPLE) document.getElementById(id).value = SAMPLE[id];
});

document.getElementById("send-btn").addEventListener("click", function () {
  var input = document.getElementById("followup-input");
  sendFollowup(input.value);
  input.value = "";
});

document.getElementById("followup-input").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    e.preventDefault();
    sendFollowup(this.value);
    this.value = "";
  }
});

(function buildChips() {
  var box = document.getElementById("agency-chips");
  AGENCIES.forEach(function (label) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = label;
    b.addEventListener("click", function () {
      sendFollowup("Please draft the public-records request email to " + label +
        " about the respondent(s) identified in this report.");
    });
    box.appendChild(b);
  });
})();
