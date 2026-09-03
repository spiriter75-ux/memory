/**
 * OpenShorts Pro Studio V2 - Landmark & Real-World Background Search Service
 * Connects to open global archive (Wikimedia Commons / Open Photography API) with zero API key required.
 */

export interface LandmarkSearchResult {
  id: string;
  title: string;
  thumbnailUrl: string;
  fullUrl: string;
  description: string;
}

export class LandmarkSearchService {
  /**
   * 실제 랜드마크/배경 키워드로 고화질 실사 사진 검색
   */
  async searchLandmarkImages(query: string, limit: number = 12): Promise<LandmarkSearchResult[]> {
    if (!query.trim()) return [];

    const endpoint = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
      query.trim()
    )}&gsrlimit=${limit}&prop=imageinfo&iiprop=url|thumburl|extmetadata&iiurlwidth=600&format=json&origin=*`;

    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const pages = data.query?.pages || {};

      const results: LandmarkSearchResult[] = [];
      for (const key of Object.keys(pages)) {
        const p = pages[key];
        const info = p.imageinfo?.[0];
        if (info && (info.thumburl || info.url)) {
          // Filter out SVG / icons / audio
          const url = info.thumburl || info.url;
          if (/\.(jpg|jpeg|png|webp)/i.test(url)) {
            const rawTitle = (p.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, '');
            results.push({
              id: String(p.pageid || key),
              title: rawTitle,
              thumbnailUrl: info.thumburl || info.url,
              fullUrl: info.url || info.thumburl,
              description: info.extmetadata?.ImageDescription?.value || rawTitle,
            });
          }
        }
      }

      return results;
    } catch (err) {
      console.error('[LandmarkSearchService] 검색 실패:', err);
      return [];
    }
  }
}

export const landmarkSearchService = new LandmarkSearchService();
