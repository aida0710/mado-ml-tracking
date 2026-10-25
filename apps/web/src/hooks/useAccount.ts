import { accountApi } from '../api/account';
import { administrationApi } from '../api/administration';
import { useQuery } from './useQuery';

/** アカウントの画面のデータ。ログイン中の利用者のプロフィール、自分のAPI token、Projectの名前。 */
export function useAccount() {
  const account = useQuery({ key: 'account', load: accountApi.get });
  // ProjectTokens・AppShellと同じキーにして、それぞれの一覧をこれらの画面で同じものとして扱う。
  const tokens = useQuery({ key: 'personal-tokens', load: administrationApi.tokens });
  const projects = useQuery({ key: 'projects', load: administrationApi.projects });
  const projectNames = new Map(projects.value?.map((project) => [project.id, project.name]));
  return { account, tokens, projects, projectNames };
}
