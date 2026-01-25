import { Common } from '../common.ts'

import type { RouterMiddleware } from '@oak/oak'

class ServiceWikiNews {
  #cache: WikiNewsItem | null = null
  #cacheDate = ''
  #lastFetchTime = 0

  handle(): RouterMiddleware<'/wikinews'> {
    return async (ctx) => {
      const data = await this.#fetch()

      switch (ctx.state.encoding) {
        case 'text':
          ctx.response.body = `Wikipedia Current Events (${data.date})\n\n${data.news
            .map((category) => {
              return `**${category.title}**\n\n${category.items
                .map((item) => item.text)
                .join('\n\n')}`
            })
            .join('\n\n')}`
          break

        case 'json':
        default:
          ctx.response.body = Common.buildJson(data)
          break
      }
    }
  }

  async #fetch(): Promise<WikiNewsItem> {
    const now = Date.now()
    const today = Common.localeDate(now).replace(/\//g, '-')
    
    if (this.#cache && this.#cacheDate === today) {
      return this.#cache
    }

    try {
      const targetDate = new Date(now - 24 * 60 * 60 * 1000)
      
      const year = targetDate.getFullYear()
      const month = targetDate.toLocaleString('en', { month: 'long' })
      const day = targetDate.getDate()
      
      const dateStr = `${year}_${month}_${day}`
      const url = `https://en.wikipedia.org/wiki/Portal:Current_events/${dateStr}`
      
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch data from Wikipedia: ${response.status}`)
      }
      
      const html = await response.text()
      
      const newsCategories = this.#extractNewsContent(html)
      
      const formattedDate = `${month} ${day}, ${year}`
      const data: WikiNewsItem = {
        date: formattedDate,
        news: newsCategories,
        source_url: url,
        updated: Common.localeTime(now),
        updated_at: now
      }

      this.#cache = data
      this.#cacheDate = today
      this.#lastFetchTime = now

      return data
    } catch (error) {
      console.error('Error fetching Wikipedia news data:', error)
      
      if (this.#cache) {
        return this.#cache
      }
      
      throw new Error('Failed to fetch Wikipedia news data and no cache available')
    }
  }

  #extractNewsContent(html: string): NewsCategory[] {
    try {
      const categories: NewsCategory[] = []
      
      const contentDivs = html.match(/<div class="current-events-content description">([\s\S]*?)<\/div>/g)
      
      if (!contentDivs || contentDivs.length === 0) {
        return [{
          title: 'Error',
          items: [{ text: 'No news content sections found in the HTML' }]
        }]
      }
      
      const firstContentDiv = contentDivs[0]
      
      const categorySections = firstContentDiv.split(/<p><b>/)
      
      if (categorySections.length <= 1) {
        return [{
          title: 'Uncategorized', 
          items: [{ text: 'No categories found in content' }]
        }]
      }
      
      if (categorySections[0].trim()) {
        const uncategorizedItems = this.#extractCategoryItems(categorySections[0], 'Uncategorized')
        if (uncategorizedItems.length > 0) {
          categories.push({
            title: 'Uncategorized',
            items: uncategorizedItems
          })
        }
      }
      
      for (let i = 1; i < categorySections.length; i++) {
        const section = categorySections[i]
        
        const titleEndIndex = section.indexOf('</b>')
        if (titleEndIndex === -1) continue
        
        const categoryTitle = section.substring(0, titleEndIndex).trim()
        
        const contentStartIndex = section.indexOf('</p>') + 4
        if (contentStartIndex === -1 + 4) continue
        
        const sectionContent = section.substring(contentStartIndex)
        const items = this.#extractCategoryItems(sectionContent, categoryTitle)
        
        if (items.length > 0) {
          categories.push({
            title: categoryTitle,
            items: items
          })
        }
      }
      
      if (categories.length === 0) {
        return [{
          title: 'Uncategorized',
          items: [{ text: 'No news items could be parsed from the source' }]
        }]
      }
      
      return categories
    } catch (error) {
      console.error('Error extracting news content:', error)
      return [{
        title: 'Parsing Error',
        items: [{ text: `Error while parsing the news content: ${error instanceof Error ? error.message : String(error)}` }]
      }]
    }
  }
  
  #extractCategoryItems(sectionContent: string, categoryTitle: string): NewsItem[] {
    const items: NewsItem[] = []
    
    try {
      const listItemRegex = /<li>([\s\S]*?)<\/li>/g
      let itemMatch
      
      while ((itemMatch = listItemRegex.exec(sectionContent)) !== null) {
        if (itemMatch[1]) {
          const itemHtml = itemMatch[1].trim()
          if (!itemHtml) continue
          const formattedText = this.#formatListItem(itemHtml)
          
          items.push({ text: formattedText })
        }
      }
      
      if (items.length === 0) {
        const plainContent = this.#cleanHtml(sectionContent)
        if (plainContent.trim()) {
          items.push({ text: `- ${plainContent.trim()}` })
        }
      }
      
      return items
    } catch (error) {
      console.error(`Error extracting items from category ${categoryTitle}:`, error)
      return [{ text: `- Error parsing items: ${error instanceof Error ? error.message : String(error)}` }]
    }
  }
  
  #formatListItem(html: string): string {
    try {

      let markdown = "- "
      let processedHtml = html.replace(/<i>(.*?)<\/i>/g, (match, content) => {
        return `*${content}*`
      })
      
      processedHtml = this.#convertLinksToMarkdown(processedHtml)
      const cleanedText = processedHtml.replace(/<[^>]*?>/g, '')
      const decodedText = this.#decodeHtmlEntities(cleanedText)
      
      return markdown + decodedText
    } catch (error) {
      console.error("Error formatting list item:", error)
      return `- Error formatting item: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  
  #convertLinksToMarkdown(html: string): string {
    let result = html
    
    result = result.replace(
      /<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/g,
      (match, href, text) => {
        if (match.includes('class="external')) {
          return match
        }
        if (href.startsWith('/')) {
          href = `https://en.wikipedia.org${href}`
        }
        return `[${text}](${href})`
      }
    )
    

    result = result.replace(
      /<a\s+[^>]*?class="external[^>]*?href="([^"]*)"[^>]*>(.*?)<\/a>/g,
      (match, href, text) => {
        return `[(${text})](${href})`
      }
    )
    return result
  }
  
  #decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&ndash;/g, "–")
      .replace(/&mdash;/g, "—")
      .replace(/&nbsp;/g, " ")
  }
  
  #cleanHtml(html: string): string {
    let text = html.replace(/<[^>]*?>/g, '')
    text = this.#decodeHtmlEntities(text)
    text = text
      .replace(/\s+/g, ' ')
      .trim()
    
    return text
  }
}

export const serviceWikiNews = new ServiceWikiNews()

interface WikiNewsItem {
  date: string
  news: NewsCategory[]
  source_url: string
  updated: string
  updated_at: number
}

interface NewsCategory {
  title: string
  items: NewsItem[]
}

interface NewsItem {
  text: string
}

interface LinkInfo {
  text: string
  url: string
  isExternal: boolean
}
