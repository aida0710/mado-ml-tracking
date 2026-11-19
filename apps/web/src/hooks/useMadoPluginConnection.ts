import { useState } from 'react';
import type { PluginConnection } from '@mmt/contracts';
import { pluginsApi } from '../api/plugins';
import { useMutation } from './useMutation';
import { useMountedRef } from './useMountedRef';

export function useMadoPluginConnection({ projectId, plugin, onSaved }: {
  projectId: string;
  plugin: PluginConnection | null;
  onSaved: (plugin: PluginConnection) => void;
}) {
  // この画面を開いてから接続を確認したか。確認した接続にだけ容量を問い合わせる。
  const [checked, setChecked] = useState(false);
  // 直前の操作が接続の確認で、成功したか。次の操作を始めると消える。
  const [showsCheckSuccess, setShowsCheckSuccess] = useState(false);
  const mounted = useMountedRef();
  const mutation = useMutation();
  function runConnectionOperation(operation: () => Promise<PluginConnection>, onSucceeded: (saved: PluginConnection) => void) {
    setShowsCheckSuccess(false);
    void mutation.run(async () => {
      const saved = await operation();
      if (mounted.current) onSucceeded(saved);
    });
  }
  function check() {
    if (!plugin) return;
    // 確認した接続には、mado S3 Data Catalogから読んだアクセストークンの許可範囲が入っている。
    runConnectionOperation(() => pluginsApi.check(projectId, plugin.id), (checkedPlugin) => {
      setChecked(true);
      setShowsCheckSuccess(true);
      onSaved(checkedPlugin);
    });
  }
  function toggle() {
    if (!plugin) return;
    runConnectionOperation(() => pluginsApi.update(projectId, plugin.id, { enabled: !plugin.enabled }), onSaved);
  }
  return { checked, showsCheckSuccess, pending: mutation.pending, error: mutation.error, check, toggle };
}
