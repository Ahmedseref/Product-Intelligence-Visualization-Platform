import type { CSSProperties } from 'react';

export const getIndustryTags = (value?: string): string[] => {
  if (!value) return [];
  return Array.from(new Set(
    value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  ));
};

const INDUSTRY_TAG_OVERRIDES: Record<string, { backgroundColor: string; color: string; borderColor: string }> = {
  'raw material supplier': {
    backgroundColor: '#dcfce7',
    color: '#166534',
    borderColor: '#bbf7d0',
  },
};

export const getIndustryTagStyle = (tag: string): CSSProperties => {
  const normalizedTag = tag.trim().toLowerCase();
  const override = INDUSTRY_TAG_OVERRIDES[normalizedTag];
  if (override) return override;

  let hash = 0;
  for (let index = 0; index < normalizedTag.length; index += 1) {
    hash = (hash * 31 + normalizedTag.charCodeAt(index)) % 360;
  }
  const hue = hash;
  return {
    backgroundColor: `hsl(${hue} 85% 94%)`,
    color: `hsl(${hue} 65% 35%)`,
    borderColor: `hsl(${hue} 70% 84%)`,
  };
};