import '@testing-library/jest-dom/vitest'
// jsdom には IndexedDB が無いため、Dexie を使うコードのテスト用に polyfill する。
import 'fake-indexeddb/auto'
