export interface ApiEnvelope<T> {
  code: number
  msg: string
  data: T
}

export interface PaginatedData<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export class ApiError extends Error {
  code: number
  msg: string

  constructor(code: number, msg: string) {
    super(msg)
    this.name = 'ApiError'
    this.code = code
    this.msg = msg
  }
}
