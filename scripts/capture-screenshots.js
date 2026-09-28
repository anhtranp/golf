import puppeteer from 'puppeteer-core'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../docs/screenshots')

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

async function capture() {
  console.log('Launching Chrome...')
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,960']
  })

  // Page 1: Capture Active Tracker & Fullscreen
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 2 })

  console.log('Navigating to http://localhost:8443/ ...')
  await page.goto('http://localhost:8443/', { waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 1000))

  // 1. Overview Dashboard (Hero)
  console.log('Capturing 01-dashboard-overview.png...')
  await page.screenshot({ path: path.join(outDir, '01-dashboard-overview.png') })

  // 2. Click "Launch Demo Swing" to start tracking
  console.log('Starting Demo Swing Tracking...')
  const buttons = await page.$$('button')
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent, btn)
    if (text && text.includes('Demo Swing')) {
      await btn.click()
      break
    }
  }

  // Toggle Joint Labels on
  await new Promise(r => setTimeout(r, 1000))
  for (const btn of await page.$$('button')) {
    const text = await page.evaluate(el => el.textContent, btn)
    if (text && text.includes('Labels')) {
      await btn.click()
      break
    }
  }

  await new Promise(r => setTimeout(r, 1200))
  console.log('Capturing 02-motion-tracker-active.png...')
  await page.screenshot({ path: path.join(outDir, '02-motion-tracker-active.png') })

  // 3. Fullscreen Studio View
  console.log('Toggling Full Screen...')
  for (const btn of await page.$$('button')) {
    const text = await page.evaluate(el => el.textContent, btn)
    if (text && text.includes('Full Screen')) {
      await btn.click()
      break
    }
  }
  await new Promise(r => setTimeout(r, 1500))
  console.log('Capturing 03-fullscreen-pro-studio.png...')
  await page.screenshot({ path: path.join(outDir, '03-fullscreen-pro-studio.png') })

  await page.close()

  // Page 2: Dashboard with Completed Swing & Detailed Analysis (Scrollable)
  console.log('Opening second page for completed session analytics...')
  const page2 = await browser.newPage()
  await page2.setViewport({ width: 1440, height: 960, deviceScaleFactor: 2 })
  await page2.goto('http://localhost:8443/', { waitUntil: 'networkidle0' })
  await new Promise(r => setTimeout(r, 800))

  // Switch to diagram or start demo swing recording to generate full session results
  for (const btn of await page2.$$('button')) {
    const text = await page2.evaluate(el => el.textContent, btn)
    if (text && text.includes('Demo Swing')) {
      await btn.click()
      break
    }
  }
  await new Promise(r => setTimeout(r, 800))

  // Click Record Swing
  for (const btn of await page2.$$('button')) {
    const text = await page2.evaluate(el => el.textContent, btn)
    if (text && text.includes('Record Swing')) {
      await btn.click()
      break
    }
  }

  // Wait for countdown (3s) and capture (3.2s)
  console.log('Waiting for swing capture to complete...')
  await new Promise(r => setTimeout(r, 7000))

  // 4. Capture Phase Performance Section
  console.log('Scrolling to Phase Performance section...')
  await page2.evaluate(() => {
    window.scrollTo({ top: 620, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 800))
  console.log('Capturing 04-phase-performance.png...')
  await page2.screenshot({ path: path.join(outDir, '04-phase-performance.png') })

  // 5. Capture PGA Benchmark Comparison & AI Coach Insights
  console.log('Scrolling to PGA Benchmark & AI Coach section...')
  await page2.evaluate(() => {
    window.scrollTo({ top: 1040, behavior: 'instant' })
  })
  await new Promise(r => setTimeout(r, 800))
  console.log('Capturing 05-pga-benchmark-and-coach.png...')
  await page2.screenshot({ path: path.join(outDir, '05-pga-benchmark-and-coach.png') })

  await browser.close()
  console.log('All 5 screenshots captured successfully!')
}

capture().catch(err => {
  console.error('Screenshot capture failed:', err)
  process.exit(1)
})
