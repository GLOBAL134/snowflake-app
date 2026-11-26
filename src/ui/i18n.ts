export type Lang = 'en' | 'ru';

const LANG_KEY = 'snowflake_lang';

export function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'ru') return saved;
  } catch {
    // ignore
  }
  const nav = (navigator.language || 'en').toLowerCase();
  if (nav.startsWith('ru') || nav.startsWith('uk') || nav.startsWith('be')) {
    return 'ru';
  }
  return 'en';
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // ignore
  }
}

export interface SiteStrings {
  navDemo: string;
  navFeatures: string;
  navDownload: string;
  navFullscreen: string;
  navBuy: string;
  heroPill: string;
  heroTitle: string;
  heroSub: string;
  heroBuyCta: string;
  heroUnlockedCta: string;
  heroTryDemo: string;
  heroFullscreen: string;
  heroStrip1: string;
  heroStrip2: string;
  heroStrip3: string;
  demoTitle: string;
  demoSub: string;
  demoHintDefault: string;
  demoHintSnowman: string;
  demoWin1Title: string;
  demoWin1Body: string;
  demoWin2Title: string;
  demoWin2Body: string;
  ctrlIntensity: string;
  ctrlTool: string;
  ctrlGarland: string;
  ctrlWind: string;
  ctrlPlow: string;
  ctrlLaunch: string;
  ctrlClearSnow: string;
  ctrlClearSnowmen: string;
  ctrlCabin: string;
  intensityLabels: { light: string; steady: string; blizzard: string };
  toolLabels: { mitten: string; snowman: string; none: string };
  garlandLabels: { wave: string; twinkle: string; off: string };
  featuresTitle: string;
  featuresSub: string;
  features: Array<{ icon: string; title: string; desc: string }>;
  dlTitle: string;
  dlSubLocked: string;
  dlSubUnlocked: string;
  dlLockedBannerTitle: string;
  dlLockedBannerDesc: string;
  dlPayBtn: string;
  dlHaveCodeBtn: string;
  dlCodePlaceholder: string;
  dlUnlockBtn: string;
  dlInvalidCode: string;
  dlUnlockedBadge: string;
  dlMacMeta: string;
  dlMacDesc: string;
  dlMacPkg: string;
  dlMacDmg: string;
  dlWinMeta: string;
  dlWinDesc: string;
  dlWinExe: string;
  dlAndMeta: string;
  dlAndDesc: string;
  dlAndApk: string;
  dlPwaBtn: string;
  dlIosMeta: string;
  dlIosDesc: string;
  dlIosGuideBtn: string;
  dlIosIpa: string;
  dlLinuxMeta: string;
  dlLinuxDesc: string;
  dlLinuxDeb: string;
  dlWebMeta: string;
  dlWebDesc: string;
  dlWebLaunch: string;
  dlLockedBtnPrefix: string;
  payModalTitle: string;
  payModalStep1: string;
  payModalStep2: string;
  payModalPayLink: string;
  iosModalTitle: string;
  iosModalSteps: [string, string, string];
  iosModalLaunch: string;
  footerCopy: string;
}

export const STRINGS: Record<Lang, SiteStrings> = {
  en: {
    navDemo: 'Live Demo',
    navFeatures: 'Features',
    navDownload: 'Get App ($5)',
    navFullscreen: '▶ Fullscreen',
    navBuy: 'Get App — $5',
    heroPill: 'macOS · Windows · Linux · Android · iOS',
    heroTitle: 'Cozy winter snow, real drifts & festive lights right on your screen',
    heroSub:
      'Real-time snow accumulation on windows & dock, interactive mitten & snowman builder, smart snowplows, and a cozy winter cabin. Try it live right here or unlock all installers for $5.',
    heroBuyCta: '❄️ Get Full App — $5',
    heroUnlockedCta: '⬇ Download Installers (Unlocked)',
    heroTryDemo: '✨ Try Live Demo Below',
    heroFullscreen: '🖥 Fullscreen Preview',
    heroStrip1: '✓ One-click .pkg/.dmg for Mac',
    heroStrip2: '✓ One-click .exe for Windows PC',
    heroStrip3: '✓ .apk for Android & PWA for iOS',
    demoTitle: 'Interactive Live Demo',
    demoSub:
      'Snow is already falling on this page. Drag & shake the windows below to spill snowdrifts and sway the garlands, or switch to Snowman mode to roll snowballs!',
    demoHintDefault:
      '💡 Drag the cards with your mouse or finger — snow spills off the roofs and the mitten sweeps drifts',
    demoHintSnowman:
      '☃️ Snowman mode: press and drag inside this area to roll a snowball and stack it on a window!',
    demoWin1Title: '❄️ Drag & shake me',
    demoWin1Body:
      'Snowdrifts build up along the top edge. Shake the window sharply to shed snow clumps!',
    demoWin2Title: '🚜 Garlands & Snowplow',
    demoWin2Body:
      'Click "▶ Launch" above to send a tractor, snowmobile, or penguin across the window.',
    ctrlIntensity: 'Snowfall',
    ctrlTool: 'Tool',
    ctrlGarland: 'Garlands',
    ctrlWind: 'Wind',
    ctrlPlow: 'Snowplow',
    ctrlLaunch: '▶ Launch',
    ctrlClearSnow: '❄️ Clear Snow',
    ctrlClearSnowmen: '🗑 Snowmen',
    ctrlCabin: '🏡 Cabin',
    intensityLabels: { light: 'Light', steady: 'Steady', blizzard: 'Blizzard' },
    toolLabels: { mitten: 'Mitten', snowman: 'Snowman', none: 'Pointer' },
    garlandLabels: { wave: 'Wave', twinkle: 'Twinkle', off: 'Off' },
    featuresTitle: 'How SnowFlake Works',
    featuresSub: 'Every effect runs in real time on your GPU (WebGL2 / Metal)',
    features: [
      {
        icon: '🏔',
        title: 'Real Snowdrifts & Occlusion',
        desc: 'Snow piles smoothly along the bottom edge, Dock/Taskbar, and window titlebars while respecting overlapping windows.'
      },
      {
        icon: '🧤',
        title: 'Mitten & Snowman Builder',
        desc: 'Brush away snowdrifts with your cursor or finger, or roll 3 snowballs and stack a snowman with a scarf and carrot nose.'
      },
      {
        icon: '🚜',
        title: 'Smart Multi-Surface Snowplow',
        desc: 'Tractor, retro truck, snowmobile, penguin, or your own photo (auto background removal) with jump & suspension physics.'
      },
      {
        icon: '✨',
        title: 'Swaying Window Garlands',
        desc: 'Wave or twinkle lights attach to window tops and swing physically whenever windows move.'
      },
      {
        icon: '🏡',
        title: 'Winter Cabin Live Wallpaper',
        desc: 'Starry night sky, glowing moon, snow-capped pines, rising chimney smoke, and warm pulsing cabin windows.'
      },
      {
        icon: '📱',
        title: 'Built for Every Device',
        desc: 'Transparent click-through overlay & tray menu on Mac/Windows, plus touch controls & tilt-to-wind on iOS/Android.'
      }
    ],
    dlTitle: 'Download SnowFlake for All Devices',
    dlSubLocked: 'One-time purchase ($5 via Tribute) unlocks all desktop & mobile installers.',
    dlSubUnlocked: 'Unlocked! Choose your platform to download in one click.',
    dlLockedBannerTitle: 'Unlock all installers for $5',
    dlLockedBannerDesc:
      'Pay $5 once via Tribute, then enter the access code you receive after payment to unlock instant 1-click downloads for macOS, Windows, Linux, Android, and iOS.',
    dlPayBtn: '💳 Pay $5 via Tribute',
    dlHaveCodeBtn: '🔑 I already have a code',
    dlCodePlaceholder: 'Enter access code (from Tribute)',
    dlUnlockBtn: 'Unlock Downloads',
    dlInvalidCode: 'Invalid access code. Please check the code from your Tribute receipt.',
    dlUnlockedBadge: '✓ Access unlocked — ready to download',
    dlMacMeta: 'Apple Silicon (M1–M4) · macOS 12+',
    dlMacDesc: 'Native menu bar overlay above all windows, Dock tracking & launch at login.',
    dlMacPkg: '⬇ Download Installer (.pkg)',
    dlMacDmg: 'Disk Image (.dmg)',
    dlWinMeta: 'Windows 10 / 11 (64-bit)',
    dlWinDesc: 'One-click NSIS installer: open the file to automatically install and launch in tray.',
    dlWinExe: '⬇ Download Installer (.exe)',
    dlAndMeta: 'Android 8+ · Phones & Tablets',
    dlAndDesc: 'Touch mitten, snowman builder, tilt-to-wind gyroscope, and live winter cabin.',
    dlAndApk: '⬇ Download APK',
    dlPwaBtn: '📲 Install PWA',
    dlIosMeta: 'iOS 15+ · Install via Safari or AltStore',
    dlIosDesc:
      'Apple blocks unsigned .ipa files directly in Safari — install in 2 taps via Safari ("Add to Home Screen") or sideload .ipa via AltStore/Sideloadly.',
    dlIosGuideBtn: '📲 Install on iPhone',
    dlIosIpa: '.ipa (AltStore)',
    dlLinuxMeta: 'Ubuntu / Debian / AppImage (x64)',
    dlLinuxDesc: 'Ready-to-install .deb package and portable AppImage.',
    dlLinuxDeb: '⬇ Download .deb',
    dlWebMeta: 'Any browser · Instant launch',
    dlWebDesc: 'Run full-screen SnowFlake right in your browser or install as a standalone PWA.',
    dlWebLaunch: '▶ Launch Fullscreen',
    dlLockedBtnPrefix: '🔒 $5 — ',
    payModalTitle: 'Get SnowFlake Full Access ($5)',
    payModalStep1: '1. Complete the $5 payment on Tribute:',
    payModalStep2: '2. Enter the access code shown after payment to unlock all downloads:',
    payModalPayLink: '💳 Open Tribute Payment ($5)',
    iosModalTitle: '📲 Install on iPhone / iPad / Android',
    iosModalSteps: [
      'Tap the Share button (square with up arrow) in Safari on iPhone, or the ⋮ menu in Chrome on Android.',
      'Select "Add to Home Screen" (or "Install app").',
      'Open SnowFlake from your Home Screen — it launches full-screen without browser bars!'
    ],
    iosModalLaunch: '▶ Open Fullscreen Mode',
    footerCopy: '❄️ SnowFlake v2.4 — Cross-platform winter overlay & live wallpaper'
  },
  ru: {
    navDemo: 'Демо',
    navFeatures: 'Возможности',
    navDownload: 'Скачать ($5)',
    navFullscreen: '▶ На весь экран',
    navBuy: 'Купить — $5',
    heroPill: 'macOS · Windows · Linux · Android · iOS',
    heroTitle: 'Уютный снег, живые сугробы и гирлянды для любого устройства',
    heroSub:
      'Настоящая физика снега на окнах и панели задач, варежка и лепка снеговиков, умный снегоуборщик и зимний домик. Попробуйте вживую ниже или получите все установщики за $5.',
    heroBuyCta: '❄️ Получить программу — $5',
    heroUnlockedCta: '⬇ Скачать установщики (Открыто)',
    heroTryDemo: '✨ Попробовать демо ниже',
    heroFullscreen: '🖥 Весь экран (PWA)',
    heroStrip1: '✓ Авто-установщик .pkg/.dmg для Mac',
    heroStrip2: '✓ One-Click .exe для Windows ПК',
    heroStrip3: '✓ .apk для Android и PWA для iOS',
    demoTitle: 'Интерактивная демонстрация',
    demoSub:
      'Снег уже падает прямо поверх этой страницы. Потяните окна внизу — гирлянды закачаются, а сугробы осыплются! Переключитесь на «Снеговик», чтобы скатать снежные комы.',
    demoHintDefault:
      '💡 Двигайте карточки мышью или пальцем — снег осыпается с крыш, а варежка смахивает сугробы',
    demoHintSnowman:
      '☃️ Режим снеговика: зажмите и тяните внутри этой области, чтобы скатать шар и поставить на окно!',
    demoWin1Title: '❄️ Потяни и потряси окно',
    demoWin1Body:
      'Сугробы копятся прямо на верхней кромке окна. При резком движении снег рассыпается хлопьями!',
    demoWin2Title: '🚜 Гирлянды и снегоуборщик',
    demoWin2Body:
      'Нажмите «▶ Пустить» сверху, чтобы трактор, снегоход или пингвин проехался по окну.',
    ctrlIntensity: 'Снегопад',
    ctrlTool: 'Инструмент',
    ctrlGarland: 'Гирлянды',
    ctrlWind: 'Ветер',
    ctrlPlow: 'Снегоуборщик',
    ctrlLaunch: '▶ Пустить',
    ctrlClearSnow: '❄️ Убрать снег',
    ctrlClearSnowmen: '🗑 Снеговики',
    ctrlCabin: '🏡 Домик',
    intensityLabels: { light: 'Лёгкий', steady: 'Ровный', blizzard: 'Метель' },
    toolLabels: { mitten: 'Варежка', snowman: 'Снеговик', none: 'Обычный' },
    garlandLabels: { wave: 'Волна', twinkle: 'Мерцание', off: 'Выкл' },
    featuresTitle: 'Как работает SnowFlake',
    featuresSub: 'Все эффекты работают в реальном времени на GPU (WebGL2 / Metal)',
    features: [
      {
        icon: '🏔',
        title: 'Живые сугробы и перекрытия',
        desc: 'Снег плавно нарастает на нижней кромке экрана, Dock/панели задач и заголовках окон, учитывая перекрытия.'
      },
      {
        icon: '🧤',
        title: 'Варежка и Снеговик',
        desc: 'Смахивайте снег курсором или пальцем в режиме «Варежка» или скатайте 3 кома и соберите снеговика.'
      },
      {
        icon: '🚜',
        title: 'Умный снегоуборщик',
        desc: 'Трактор, ретро-грузовик, снегоход, пингвин или ваше фото (фон удалится сам) с физикой прыжков и подвески.'
      },
      {
        icon: '✨',
        title: 'Качающиеся гирлянды',
        desc: 'Огоньки в режиме «Волна» или «Мерцание» крепятся к верхнему краю окон и раскачиваются при движении.'
      },
      {
        icon: '🏡',
        title: 'Живые обои «Зимний домик»',
        desc: 'Звёздное небо, луна, заснеженные ели, дым из трубы и тёплый свет в окнах домика.'
      },
      {
        icon: '📱',
        title: 'Адаптация под все устройства',
        desc: 'Прозрачный оверлей в трее на Mac/Windows, touch-управление и ветер от наклона на iOS/Android.'
      }
    ],
    dlTitle: 'Получить SnowFlake для всех устройств',
    dlSubLocked: 'Разовая покупка за $5 через Tribute открывает доступ ко всем установщикам.',
    dlSubUnlocked: 'Доступ открыт! Выберите ваше устройство для скачивания в один клик.',
    dlLockedBannerTitle: 'Откройте все установщики за $5',
    dlLockedBannerDesc:
      'Оплатите $5 через Tribute, затем введите код доступа, который вы получите после оплаты, чтобы скачать версии для macOS, Windows, Linux, Android и iOS.',
    dlPayBtn: '💳 Оплатить $5 через Tribute',
    dlHaveCodeBtn: '🔑 У меня уже есть код',
    dlCodePlaceholder: 'Введите код доступа (из Tribute)',
    dlUnlockBtn: 'Открыть скачивание',
    dlInvalidCode: 'Неверный код доступа. Проверьте код в сообщении после оплаты в Tribute.',
    dlUnlockedBadge: '✓ Доступ открыт — можно скачивать',
    dlMacMeta: 'Apple Silicon (M1–M4) · macOS 12+',
    dlMacDesc: 'Нативный оверлей в меню-баре поверх всех окон, отслеживание Dock и автозапуск.',
    dlMacPkg: '⬇ Скачать установщик (.pkg)',
    dlMacDmg: 'Образ (.dmg)',
    dlWinMeta: 'Windows 10 / 11 (64-bit)',
    dlWinDesc: 'One-Click установщик: открываете файл — приложение само ставится и появляется в трее.',
    dlWinExe: '⬇ Скачать установщик (.exe)',
    dlAndMeta: 'Android 8+ · Телефоны и планшеты',
    dlAndDesc: 'Свайпы пальцем, лепка снеговиков, ветер наклоном телефона и живой домик.',
    dlAndApk: '⬇ Скачать APK',
    dlPwaBtn: '📲 Установить PWA',
    dlIosMeta: 'iOS 15+ · Safari или AltStore',
    dlIosDesc:
      'Apple не разрешает ставить неподписанные .ipa прямо из браузера — установите в 2 касания через Safari («На экран „Домой“») или через AltStore/Sideloadly.',
    dlIosGuideBtn: '📲 Установить на iPhone',
    dlIosIpa: '.ipa (AltStore)',
    dlLinuxMeta: 'Ubuntu / Debian / AppImage (x64)',
    dlLinuxDesc: 'Готовый пакет .deb для автоматической установки и универсальный AppImage.',
    dlLinuxDeb: '⬇ Скачать .deb',
    dlWebMeta: 'Любой браузер · Быстрый запуск',
    dlWebDesc: 'Запустите полноэкранный SnowFlake прямо в браузере или установите как PWA.',
    dlWebLaunch: '▶ На весь экран',
    dlLockedBtnPrefix: '🔒 $5 — ',
    payModalTitle: 'Получение SnowFlake ($5)',
    payModalStep1: '1. Оплатите $5 по ссылке Tribute:',
    payModalStep2: '2. Введите код доступа после оплаты, чтобы открыть все ссылки для скачивания:',
    payModalPayLink: '💳 Перейти к оплате ($5)',
    iosModalTitle: '📲 Установка на iPhone / iPad / Android',
    iosModalSteps: [
      'Нажмите «Поделиться» (квадрат со стрелкой вверх) в Safari на iPhone или меню ⋮ в Chrome на Android.',
      'Выберите «На экран „Домой“» (или «Установить приложение»).',
      'Откройте иконку SnowFlake — приложение запустится на весь экран без рамок браузера!'
    ],
    iosModalLaunch: '▶ Открыть полноэкранный режим',
    footerCopy: '❄️ SnowFlake v2.4 — кроссплатформенный зимний оверлей и живые обои'
  }
};
