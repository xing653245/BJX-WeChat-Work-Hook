const STORAGE_KEY = 'vwork_onboarding_done'

export function shouldShowOnboarding() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '1'
  } catch {
    return true
  }
}

export function markOnboardingDone() {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function resetOnboarding() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
