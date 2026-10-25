import { accountApi } from '../api/account';
import { administrationApi } from '../api/administration';
import { useQuery } from './useQuery';

/** The account page's data: the signed-in user's profile, own API tokens and Project names. */
export function useAccount() {
  const account = useQuery({ key: 'account', load: accountApi.get });
  // Same keys as ProjectTokens and AppShell, so these views share one notion of each list.
  const tokens = useQuery({ key: 'personal-tokens', load: administrationApi.tokens });
  const projects = useQuery({ key: 'projects', load: administrationApi.projects });
  const projectNames = new Map(projects.value?.map((project) => [project.id, project.name]));
  return { account, tokens, projects, projectNames };
}
