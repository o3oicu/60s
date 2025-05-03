export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: process.env.PORT ? +process.env.PORT : 4399,
  encodingParamName: process.env.ENCODING_PARAM_NAME || 'encoding',
}
