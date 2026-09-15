# FHAssistant — demonstration mockup

Static mock pages for the FHAssistant training demo: a non-functional sign-in
screen (`index.html`) and a landing page listing the six modules (`home.html`).

- The sign-in form validates, stores, and transmits nothing — any input (or
  none) proceeds to the landing page.
- Only **Identify Respondents and Key Records Collection** is live; it opens
  the Custom GPT in a new tab. To point it at the real GPT, edit
  `RESPONDENTS_GPT_URL` near the bottom of `home.html`.
- All other module cards show a "not enabled in this demonstration" notice.

No build step; served via GitHub Pages.
