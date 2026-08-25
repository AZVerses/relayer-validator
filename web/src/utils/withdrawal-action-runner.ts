interface WithdrawalActionRunnerOptions {
  ids: string[]
  markLoading: (ids: string[]) => void
  clearLoading: (ids: string[]) => void
  precheck: () => Promise<boolean>
  submit: () => Promise<unknown>
}

export async function runWithdrawalAction({
  ids,
  markLoading,
  clearLoading,
  precheck,
  submit,
}: WithdrawalActionRunnerOptions): Promise<boolean> {
  markLoading(ids)
  try {
    if (!await precheck()) return false
    await submit()
    return true
  } finally {
    clearLoading(ids)
  }
}
