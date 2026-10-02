/** The colours of the page and the 3D scenes in one theme. */
export interface ThemeColours {
  background: string;
  surface: string;
  surfaceHover: string;
  ink: string;
  muted: string;
  border: string;
  accent: string;
  accentInk: string;
}

/** The theme's named hues, which states are mapped onto. */
export interface ThemeHues {
  green: string;
  red: string;
  yellow: string;
  blue: string;
  orange: string;
  purple: string;
  cyan: string;
  grey: string;
}

/** One selectable theme. */
export interface Theme {
  id: string;
  name: string;
  isLight: boolean;
  colours: ThemeColours;
  hues: ThemeHues;
}

const STORAGE_KEY = 'order-visualizer-theme';
const DEFAULT_THEME_ID = 'one-dark';

const THEMES: Theme[] = [
  {
    id: 'one-dark',
    name: 'One Dark',
    isLight: false,
    colours: {
      background: '#282c34',
      surface: '#21252b',
      surfaceHover: '#2c313a',
      ink: '#abb2bf',
      muted: '#7f848e',
      border: 'rgba(255, 255, 255, 0.08)',
      accent: '#61afef',
      accentInk: '#1b1d23',
    },
    hues: {
      green: '#98c379',
      red: '#e06c75',
      yellow: '#e5c07b',
      blue: '#61afef',
      orange: '#d19a66',
      purple: '#c678dd',
      cyan: '#56b6c2',
      grey: '#5c6370',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    isLight: false,
    colours: {
      background: '#282a36',
      surface: '#21222c',
      surfaceHover: '#343746',
      ink: '#f8f8f2',
      muted: '#8b93c1',
      border: 'rgba(255, 255, 255, 0.08)',
      accent: '#bd93f9',
      accentInk: '#21222c',
    },
    hues: {
      green: '#50fa7b',
      red: '#ff5555',
      yellow: '#f1fa8c',
      blue: '#8be9fd',
      orange: '#ffb86c',
      purple: '#bd93f9',
      cyan: '#8be9fd',
      grey: '#6272a4',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    isLight: false,
    colours: {
      background: '#272822',
      surface: '#1e1f1c',
      surfaceHover: '#3e3d32',
      ink: '#f8f8f2',
      muted: '#a59f85',
      border: 'rgba(255, 255, 255, 0.08)',
      accent: '#a6e22e',
      accentInk: '#1e1f1c',
    },
    hues: {
      green: '#a6e22e',
      red: '#f92672',
      yellow: '#e6db74',
      blue: '#66d9ef',
      orange: '#fd971f',
      purple: '#ae81ff',
      cyan: '#66d9ef',
      grey: '#75715e',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    isLight: false,
    colours: {
      background: '#2e3440',
      surface: '#3b4252',
      surfaceHover: '#434c5e',
      ink: '#eceff4',
      muted: '#9aa5b8',
      border: 'rgba(255, 255, 255, 0.08)',
      accent: '#88c0d0',
      accentInk: '#2e3440',
    },
    hues: {
      green: '#a3be8c',
      red: '#bf616a',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      orange: '#d08770',
      purple: '#b48ead',
      cyan: '#88c0d0',
      grey: '#4c566a',
    },
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    isLight: false,
    colours: {
      background: '#282828',
      surface: '#1d2021',
      surfaceHover: '#3c3836',
      ink: '#ebdbb2',
      muted: '#a89984',
      border: 'rgba(255, 255, 255, 0.08)',
      accent: '#fe8019',
      accentInk: '#1d2021',
    },
    hues: {
      green: '#b8bb26',
      red: '#fb4934',
      yellow: '#fabd2f',
      blue: '#83a598',
      orange: '#fe8019',
      purple: '#d3869b',
      cyan: '#8ec07c',
      grey: '#928374',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    isLight: false,
    colours: {
      background: '#002b36',
      surface: '#073642',
      surfaceHover: '#0b4452',
      ink: '#93a1a1',
      muted: '#657b83',
      border: 'rgba(255, 255, 255, 0.08)',
      accent: '#268bd2',
      accentInk: '#fdf6e3',
    },
    hues: {
      green: '#859900',
      red: '#dc322f',
      yellow: '#b58900',
      blue: '#268bd2',
      orange: '#cb4b16',
      purple: '#6c71c4',
      cyan: '#2aa198',
      grey: '#586e75',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    isLight: false,
    colours: {
      background: '#1a1b26',
      surface: '#16161e',
      surfaceHover: '#292e42',
      ink: '#c0caf5',
      muted: '#737aa2',
      border: 'rgba(255, 255, 255, 0.07)',
      accent: '#7aa2f7',
      accentInk: '#16161e',
    },
    hues: {
      green: '#9ece6a',
      red: '#f7768e',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      orange: '#ff9e64',
      purple: '#bb9af7',
      cyan: '#7dcfff',
      grey: '#565f89',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    isLight: false,
    colours: {
      background: '#1e1e2e',
      surface: '#181825',
      surfaceHover: '#313244',
      ink: '#cdd6f4',
      muted: '#9399b2',
      border: 'rgba(255, 255, 255, 0.07)',
      accent: '#cba6f7',
      accentInk: '#181825',
    },
    hues: {
      green: '#a6e3a1',
      red: '#f38ba8',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      orange: '#fab387',
      purple: '#cba6f7',
      cyan: '#94e2d5',
      grey: '#6c7086',
    },
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    isLight: false,
    colours: {
      background: '#011627',
      surface: '#01111d',
      surfaceHover: '#0b2942',
      ink: '#d6deeb',
      muted: '#7e97ab',
      border: 'rgba(255, 255, 255, 0.07)',
      accent: '#82aaff',
      accentInk: '#01111d',
    },
    hues: {
      green: '#addb67',
      red: '#ef5350',
      yellow: '#ecc48d',
      blue: '#82aaff',
      orange: '#f78c6c',
      purple: '#c792ea',
      cyan: '#7fdbca',
      grey: '#5f7e97',
    },
  },
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    isLight: false,
    colours: {
      background: '#0d1117',
      surface: '#161b22',
      surfaceHover: '#21262d',
      ink: '#e6edf3',
      muted: '#7d8590',
      border: 'rgba(240, 246, 252, 0.1)',
      accent: '#2f81f7',
      accentInk: '#ffffff',
    },
    hues: {
      green: '#3fb950',
      red: '#f85149',
      yellow: '#d29922',
      blue: '#58a6ff',
      orange: '#db6d28',
      purple: '#bc8cff',
      cyan: '#39c5cf',
      grey: '#6e7681',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    isLight: true,
    colours: {
      background: '#fdf6e3',
      surface: '#eee8d5',
      surfaceHover: '#e4ddc8',
      ink: '#586e75',
      muted: '#839496',
      border: 'rgba(0, 43, 54, 0.12)',
      accent: '#268bd2',
      accentInk: '#fdf6e3',
    },
    hues: {
      green: '#859900',
      red: '#dc322f',
      yellow: '#b58900',
      blue: '#268bd2',
      orange: '#cb4b16',
      purple: '#6c71c4',
      cyan: '#2aa198',
      grey: '#93a1a1',
    },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    isLight: true,
    colours: {
      background: '#ffffff',
      surface: '#f6f8fa',
      surfaceHover: '#eaeef2',
      ink: '#1f2328',
      muted: '#656d76',
      border: 'rgba(31, 35, 40, 0.12)',
      accent: '#0969da',
      accentInk: '#ffffff',
    },
    hues: {
      green: '#1a7f37',
      red: '#cf222e',
      yellow: '#9a6700',
      blue: '#0969da',
      orange: '#bc4c00',
      purple: '#8250df',
      cyan: '#1b7c83',
      grey: '#8c959f',
    },
  },
];

/** Holds the list of themes and the one in use, and applies a theme to the page. */
export class ThemeRegistry {
  current: Theme;

  /** Starts with the theme saved in this browser, or One Dark. */
  constructor() {
    this.current = this.find(this.savedId()) ?? this.find(DEFAULT_THEME_ID) ?? THEMES[0];
  }

  /**
   * Lists every theme, dark ones first.
   * @returns The themes.
   */
  all(): Theme[] {
    return THEMES;
  }

  /**
   * Switches theme, saves the choice in this browser and recolours the page.
   * @param id The theme's id.
   * @returns The theme now in use.
   */
  use(id: string): Theme {
    const theme = this.find(id);
    if (theme !== undefined) {
      this.current = theme;
      this.saveId(id);
    }
    return this.applyToPage();
  }

  /**
   * Writes the current theme's colours into the page's CSS variables.
   * @returns The theme now in use.
   */
  applyToPage(): Theme {
    const style = document.documentElement.style;
    const { colours, hues } = this.current;
    style.setProperty('--page', colours.background);
    style.setProperty('--surface', colours.surface);
    style.setProperty('--surface-hover', colours.surfaceHover);
    style.setProperty('--ink', colours.ink);
    style.setProperty('--ink-muted', colours.muted);
    style.setProperty('--border', colours.border);
    style.setProperty('--accent', colours.accent);
    style.setProperty('--accent-ink', colours.accentInk);
    style.setProperty('--live', hues.green);
    style.setProperty('--error', hues.red);
    document.documentElement.style.colorScheme = this.current.isLight ? 'light' : 'dark';
    return this.current;
  }

  /**
   * Finds a theme by id.
   * @param id The id, or null.
   * @returns The theme, or undefined when there is none with that id.
   */
  private find(id: string | null): Theme | undefined {
    return THEMES.find((theme) => theme.id === id);
  }

  /**
   * Saves the theme id in this browser, doing nothing when storage is unavailable.
   * @param id The theme's id.
   */
  private saveId(id: string): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      return;
    }
  }

  /**
   * Reads the theme id saved in this browser.
   * @returns The id, or null when none is saved or storage is unavailable.
   */
  private savedId(): string | null {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
}

export const themeRegistry = new ThemeRegistry();
