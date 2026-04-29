// Stub for react-native-purchases — used in Expo Go (no native modules available).
// EAS builds use the real react-native-purchases package.
const noop = () => Promise.resolve();
const stub = {
  setLogLevel: () => {},
  configure: () => {},
  getOfferings: () => Promise.resolve({ current: null }),
  purchasePackage: () => Promise.reject({ userCancelled: true }),
  restorePurchases: () => Promise.resolve({ entitlements: { active: {} } }),
  addCustomerInfoUpdateListener: () => ({ remove: () => {} }),
};
module.exports = stub;
module.exports.default = stub;
module.exports.LOG_LEVEL = { ERROR: 'ERROR', DEBUG: 'DEBUG', INFO: 'INFO' };
