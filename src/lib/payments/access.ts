export function subscriptionGrantsAccess(subscription: {
  status: string; current_period_end?: string | null; trial_ends_at?: string | null
} | null, now = Date.now()) {
  if (!subscription) return false
  if (subscription.status === "active") return !subscription.current_period_end || Date.parse(subscription.current_period_end) > now
  if (subscription.status === "trialing") return !subscription.trial_ends_at || Date.parse(subscription.trial_ends_at) > now
  return false
}
