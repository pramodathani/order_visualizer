import { useTheme } from '../hooks/useTheme';
import { themeRegistry } from '../utilities/themes';

/**
 * The header's list of themes.
 * @returns A labelled select box.
 */
export function ThemePicker() {
  const [theme, choose] = useTheme();
  const themes = themeRegistry.all();
  return (
    <label className="theme-picker">
      <span className="muted">Theme</span>
      <select value={theme.id} onChange={(event) => choose(event.target.value)}>
        <optgroup label="Dark">
          {themes
            .filter((candidate) => !candidate.isLight)
            .map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
        </optgroup>
        <optgroup label="Light">
          {themes
            .filter((candidate) => candidate.isLight)
            .map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
        </optgroup>
      </select>
    </label>
  );
}
