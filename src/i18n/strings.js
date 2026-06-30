// Static UI string dictionary for English / Hindi / Gujarati.
// Shape: { 'namespace.key': { en, hi, gu } }. Look up via useLang().t('namespace.key').
//
// Each screen owns a locale file under ./locales. `common` holds shared atoms and
// the domain glossary — reuse those keys across screens for consistent terminology.
import common from './locales/common';
import home from './locales/home';
import settings from './locales/settings';
import login from './locales/login';
import onboarding from './locales/onboarding';
import permission from './locales/permission';
import orderDetail from './locales/orderDetail';
import editOrder from './locales/editOrder';
import recordings from './locales/recordings';
import processing from './locales/processing';
import popup from './locales/popup';
import help from './locales/help';

const STRINGS = {
  ...common,
  ...home,
  ...settings,
  ...login,
  ...onboarding,
  ...permission,
  ...orderDetail,
  ...editOrder,
  ...recordings,
  ...processing,
  ...popup,
  ...help,
};

export default STRINGS;
