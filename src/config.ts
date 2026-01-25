export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: process.env.PORT ? +process.env.PORT : 4399,
  debug: !!process.env.DEBUG,
  overseas_first: !!process.env.OVERSEAS_FIRST,
  encodingParamName: process.env.ENCODING_PARAM_NAME || 'encoding',
}

export const COMMON_MSG = `(^_^)`
