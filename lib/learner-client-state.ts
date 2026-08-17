const learnerStorageKeys = [
  "okey-english:onboarding-complete",
  "okey-english:home-screen-prompted",
  "okey-english:pending-plan-items:v1",
  "okey-english:pending-reviews:v1",
  "catch-english:dismissed-today-return-plan",
] as const

export function clearLearnerClientState(
  storage: Storage = window.localStorage
) {
  learnerStorageKeys.forEach((key) => storage.removeItem(key))
}
