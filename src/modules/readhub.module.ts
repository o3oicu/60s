import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceReadhub {
  #cache: ReadhubNewsItem | null = null
  #cacheTime = 0
  #cacheDuration = 30 * 60 * 1000 // 30 minutes

  handle(): RouterMiddleware<'/readhub'> {
    return async (ctx) => {
      const data = await this.#fetch()

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `Readhub 热门话题（${data.date}）\n\n${data.news
            .map((e, idx) => `${idx + 1}. ${e.title}`)
            .join('\n')}\n\n${data.tip ? `【微语】${data.tip}` : ''}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(data)
          break
      }
    }
  }

  async #fetch(): Promise<ReadhubNewsItem> {
    const now = Date.now()
    
    // Return cached data if it's still valid
    if (this.#cache && now - this.#cacheTime < this.#cacheDuration) {
      return this.#cache
    }

    try {
      const response = await fetch('https://readhub.cn/daily')
      
      if (!response.ok) {
        throw new Error('Failed to fetch data from Readhub')
      }
      
      const html = await response.text()
      
      // Parse the HTML response
      const newsItems: { title: string; link: string }[] = []
      
      // Basic HTML parsing
      const articlePattern = /<a\s+[^>]*?href="(\/topic\/[^"]+)"[^>]*?>([^<]+)<\/a>/g
      let match
      
      while ((match = articlePattern.exec(html)) !== null) {
        const link = 'https://readhub.cn' + match[1]
        const title = match[2].trim()
        
        if (title && link) {
          newsItems.push({ title, link })
        }
      }

      const date = Common.localeDate(now)
      
      const data: ReadhubNewsItem = {
        date,
        news: newsItems,
        tip: '万物之中，希望至美',
        updated: Common.localeTime(now),
        updated_at: now,
      }

      // Update cache
      this.#cache = data
      this.#cacheTime = now

      return data
    } catch (error) {
      console.error('Error fetching Readhub data:', error)
      
      // Return cached data if available, otherwise throw
      if (this.#cache) {
        return this.#cache
      }
      
      throw new Error('Failed to fetch Readhub data and no cache available')
    }
  }
}

export const serviceReadhub = new ServiceReadhub()

interface ReadhubNewsItem {
  date: string
  news: {
    title: string
    link: string
  }[]
  tip: string
  updated: string
  updated_at: number
}
