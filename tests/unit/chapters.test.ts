import { describe, it, expect } from 'vitest'
import { normalizeChapters } from '../../src/main/chapters'

describe('normalizeChapters', () => {
  it('parses a well-formed chapters file', () => {
    const raw = {
      version: '1.2.0',
      chapters: [
        { title: 'Intro', startTime: 0 },
        { title: 'Main Topic', startTime: 120, img: 'https://example.com/art.png' }
      ]
    }
    expect(normalizeChapters(raw)).toEqual([
      { title: 'Intro', startTime: 0, img: null },
      { title: 'Main Topic', startTime: 120, img: 'https://example.com/art.png' }
    ])
  })

  it('sorts chapters by startTime', () => {
    const raw = {
      chapters: [
        { title: 'B', startTime: 200 },
        { title: 'A', startTime: 10 }
      ]
    }
    expect(normalizeChapters(raw).map((c) => c.title)).toEqual(['A', 'B'])
  })

  it('drops entries missing a title or startTime instead of throwing', () => {
    const raw = {
      chapters: [
        { title: 'Valid', startTime: 5 },
        { startTime: 10 },
        { title: 'No time' },
        { title: 42, startTime: 15 }
      ]
    }
    expect(normalizeChapters(raw)).toEqual([{ title: 'Valid', startTime: 5, img: null }])
  })

  it('returns an empty array when chapters is missing or not an array', () => {
    expect(normalizeChapters({})).toEqual([])
    expect(normalizeChapters({ chapters: 'nope' })).toEqual([])
    expect(normalizeChapters(null)).toEqual([])
    expect(normalizeChapters(undefined)).toEqual([])
  })
})
