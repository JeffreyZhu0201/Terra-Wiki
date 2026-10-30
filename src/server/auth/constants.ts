/** 会话 cookie 名。单独放一个模块，让 proxy.ts 能引用而不牵动 next/headers。 */
export const SESSION_COOKIE = 'terra_session'
