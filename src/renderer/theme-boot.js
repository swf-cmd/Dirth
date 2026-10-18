/* Choose the saved city before the first style pass, so the window opens in
 * its colors instead of easing out of Tokyo's. app.js fills in the city copy. */
'use strict';
document.documentElement.dataset.theme = window.TokyoThemes.normalizeTheme(window.tokyo?.initialPreferences?.theme);
