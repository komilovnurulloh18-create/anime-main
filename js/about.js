import { ensureSeedData } from '/shop/storage.js';
import { applyTranslations, initLangSwitcher } from '/shop/i18n.js';
import { updateCartBadge } from '/shop/ui.js';

ensureSeedData();
applyTranslations();
initLangSwitcher();
updateCartBadge();
