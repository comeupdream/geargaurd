/* Backend URL for the live readout.
 *
 * This file is REWRITTEN AT BUILD TIME by build.sh from the API_URL
 * environment variable, so the deployed site points at the deployed backend
 * without anyone editing a committed file. The value below is the local-dev
 * default and the safe fallback: if the build step does not run, the page
 * still loads and simply reports that no backend is configured.
 *
 * Leave it empty ("") to render the deck with every live figure honestly
 * blank — useful for previewing the design with no backend at all.
 *
 * Note: running ./build.sh locally overwrites this file. That is intended
 * (the deploy does exactly that); `git checkout site/config.js` puts the
 * dev default back. */
window.GG_API = "http://localhost:8000";
