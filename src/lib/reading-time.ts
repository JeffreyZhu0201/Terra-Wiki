/**
 * 阅读时长估算。中文按字数、英文按词数，两者混排时分别算再相加。
 * 粗略但稳定——够用来显示"8 分钟"这样的量级。
 */
export function estimateReadingTime(markdown: string): number {
  const cjk = (markdown.match(/[一-鿿]/g) ?? []).length
  const latin = (markdown.replace(/[一-鿿]/g, ' ').match(/[a-zA-Z0-9_'-]+/g) ?? []).length
  const minutes = cjk / 350 + latin / 200
  return Math.max(1, Math.round(minutes))
}
