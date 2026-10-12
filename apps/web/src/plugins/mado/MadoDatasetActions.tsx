import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { DatasetPluginActionsProps } from '../types';
import { getMadoVersionUrl } from './madoVersionUrl';
import { useLocale } from '../../i18n/useLocale';
import { pluginsText } from '../../i18n/plugins';

export function MadoDatasetActions({ projectId, availability, version }: DatasetPluginActionsProps) {
  useLocale();
  if (!availability.enabled || !availability.configured || !availability.id) return null;
  if (!version) return availability.canImport ? (
    <Link className="button" to={`/projects/${projectId}/plugins?id=${availability.id}`}>
      {pluginsText.madoImport}
    </Link>
  ) : null;
  const url = getMadoVersionUrl({ projectId, availability, version });
  return url ? (
    <a className="button small" href={url} target="_blank" rel="noopener noreferrer">
      <ExternalLink size={14} />
      {pluginsText.madoOpenVersion}
    </a>
  ) : null;
}
