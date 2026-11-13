// チュートリアルの「次にやること」
// ゲームの状態から、いまのフェーズでやることの一覧と、どこまで終わったかを作る（純粋な関数）。
import { caseById } from './cases';
import type { Screen } from './issues';
import { canRelease } from './project';
import type { GameState } from './types';

export interface GuideStep {
  id: string;
  text: string; // やること
  hint?: string; // 補足（なぜ・どうやって）
  done: boolean;
  optional?: boolean; // やらなくても先へ進める
  screen?: Screen; // この作業をする画面
}

export interface Guide {
  title: string; // いまの段階
  goal: string; // この段階の目的
  steps: GuideStep[];
  /** 次にやるべき手順（終わっていない、任意でない最初の手順） */
  current: string | null;
}

export function buildGuide(s: GameState): Guide {
  const p = s.project;
  const g = (title: string, goal: string, steps: GuideStep[]): Guide => ({
    title,
    goal,
    steps,
    current: steps.find((x) => !x.done && !x.optional)?.id ?? null,
  });

  if (!p)
    return g('依頼を受ける', 'まずは依頼を1つ引き受けて、情報システムづくりを始めましょう。', [
      {
        id: 'start',
        text: '難しさ★1の依頼を引き受ける',
        hint: '「開発」画面の依頼一覧（司令室の左にも出ています）で、依頼主・予算・納期を確かめて「この依頼を受ける」を押します。評判が上がると、予算の大きい難しい依頼も受けられるようになります。',
        done: false,
        screen: 'dev',
      },
    ]);

  const c = caseById(p.caseId);
  const did = (kind: string) => c.stakeholders.some((x) => x.kind === kind && p.done.includes(x.id));

  switch (p.phase) {
    case 'investigate': {
      const quizzes = p.foundProblems.filter((id) => c.problems.find((x) => x.id === id)?.quiz);
      const needsNda = c.stakeholders.some((x) => x.needsNda);
      return g('1. 調査', '依頼主の話をうのみにせず、「誰が・何に困っているのか」と、その原因を見つけます。', [
        { id: 'interview', text: '関係者にヒアリングする', hint: '依頼主だけでなく、現場で使う人の話も聞くと、本当の問題が見つかります。調査には日数がかかります（5日で1週間）。', done: did('interview'), screen: 'dev' },
        ...(needsNda
          ? [{ id: 'nda', text: '秘密保持契約（NDA）を結ぶ', hint: '業務データ（利用記録など）を見せてもらうには、先に秘密を守る約束が必要です。', done: p.nda, screen: 'dev' as Screen }]
          : []),
        { id: 'analysis', text: '業務データを分析する', hint: 'データの件数やアクセス数が分かると、設計で処理時間やサーバーの負荷を見積もれます。', done: did('analysis'), screen: 'dev' },
        {
          id: 'quiz',
          text: '見つけた問題の「原因クイズ」に答える',
          hint: '正解すると依頼主の信頼が上がります。',
          done: quizzes.length > 0 && quizzes.every((id) => id in p.quizAnswers),
          optional: true,
          screen: 'dev',
        },
        { id: 'finish', text: '「調査を終えて要件定義へ」を押す', hint: '見つけていない問題は、作るものに入れられません。', done: false, screen: 'dev' },
      ]);
    }
    case 'requirements':
      return g('2. 要件定義', '何を作るか（機能）と、どんな契約で作るかを決めます。', [
        { id: 'features', text: '作る機能を選ぶ', hint: '見つけた問題を解決する機能を選びましょう。機能を増やすほど便利ですが、工数（人週）と費用が増えます。', done: c.features.some((f) => !f.required && p.features.includes(f.id)), screen: 'dev' },
        { id: 'contract', text: '契約の形（請負・準委任）を選ぶ', hint: '請負は「完成させる約束」で利益は大きいが遅れると損。準委任は「作業する約束」で安定しているが利益は小さめ。', done: !!p.contract, screen: 'dev' },
        { id: 'confirm', text: '「要件を確定して設計へ」を押す', done: false, screen: 'dev' },
      ]);
    case 'design': {
      const placed = c.dataModel.attributes.every((a) => p.design.dataModel[a.id]);
      return g('3. 設計', '選んだ内容から、処理時間・稼働率・費用が実際の式で計算されます。タブを順に見ていきましょう。', [
        { id: 'data', text: '「データベース」タブ：項目を表に分ける（正規化）', hint: '同じ情報を何か所にも書くと、更新のときに食い違いが起きます。', done: placed, screen: 'dev' },
        {
          id: 'process',
          text: '「処理・アルゴリズム」タブ：処理の方式を選ぶ',
          hint: 'データが増えても速い方式（計算量の小さいもの）を選びましょう。「🧩 ブロックで作る」で自分でプログラムを組むこともできます。',
          done: Object.keys(p.design.programs ?? {}).length > 0 || c.processes.some((pr) => p.design.processes[pr.id] !== pr.options[0].id),
          optional: true,
          screen: 'dev',
        },
        { id: 'infra', text: '「サーバー・ネットワーク」タブ：構成を決める', hint: 'アクセスの多い時間にさばけるか、1台壊れたら止まらないか（単一障害点）を確かめます。', done: false, optional: true, screen: 'dev' },
        { id: 'security', text: '「セキュリティ・法務」タブ：対策を入れる', hint: '個人情報を扱うなら、暗号化やアクセス権の管理が必要です。', done: p.design.measures.length > 0, screen: 'dev' },
        { id: 'backup', text: '「バックアップ」タブ：方式と頻度を決める', hint: 'どこまで前のデータに戻れるか（RPO）と、どれだけで復旧できるか（RTO）が決まります。', done: p.design.backup.type !== 'none', screen: 'dev' },
        { id: 'review', text: '「設計レビュー」タブで確認して「設計を確定して開発へ」を押す', hint: '警告が出ていたら、どのタブを直せばよいか書いてあります。', done: false, screen: 'dev' },
      ]);
    }
    case 'develop': {
      const test = p.tasks.find((t) => t.kind === 'test');
      return g('4. 開発', 'メンバーに作業を割り当てて、1週間ずつ進めます。納期と予算に気をつけましょう。', [
        { id: 'assign', text: 'メンバーを作業に割り当てる', hint: '得意なスキルの作業ほど速く、バグも少なくなります（最初は自動で割り当て済み）。', done: Object.values(p.assignments).some((x) => x !== 'rest'), screen: 'dev' },
        { id: 'time', text: '上の ▶（再生）か「1週進める」で時間を進める', hint: '大事なことが起きると自動で一時停止します。', done: p.devWeeks > 0 },
        ...(p.pendingEvent
          ? [{ id: 'event', text: '依頼主からの相談に返事をする', hint: '返事をするまで開発は進みません。', done: false, screen: 'main' as Screen }]
          : []),
        { id: 'test', text: 'テストでバグを減らす', hint: 'バグが多いまま出すと、運用中に障害が起きて満足度が下がります。', done: !!test && test.progress > 0, optional: true, screen: 'dev' },
        { id: 'release', text: '必須の作業が終わったら「リリースする」を押す', hint: canRelease(p) ? 'リリースできます。' : 'まだ終わっていない必須の作業があります。', done: false, screen: 'dev' },
      ]);
    }
    case 'operate': {
      const ops = p.ops!;
      return g('5. 運用', '作ったシステムを動かし続けます。障害・攻撃・アクセス集中・要望に対応しましょう。', [
        { id: 'time', text: '▶ で運用を進める', hint: `運用保守の契約は${c.opsWeeks}週です。毎週、運用保守費が入ります。`, done: ops.week > 0 },
        { id: 'issues', text: '司令室の左の「対応が必要なこと」を確認する', hint: '赤は障害・緊急、紫はセキュリティ、黄は要確認。選ぶと原因と対応の候補が出ます。', done: false, optional: true, screen: 'main' },
        { id: 'requests', text: '利用者の要望に応える', hint: '「開発」画面で要望を受けると、満足度が上がります（作業が必要です）。', done: ops.acceptedRequests.length > 0, optional: true, screen: 'dev' },
        { id: 'infra', text: '遅い・止まるなら、構成を見直す', hint: '「システム」画面でサーバーの増設などができます。変更には時間がかかります。', done: !!ops.pendingInfra, optional: true, screen: 'system' },
        { id: 'end', text: `運用期間（${c.opsWeeks}週）を終える`, done: false },
      ]);
    }
    case 'done':
      return g('6. 完了', '依頼主の満足度で評判が決まります。結果を振り返りましょう。', [
        { id: 'result', text: '結果を見て「評価を受けてオフィスに戻る」を押す', hint: '次の依頼に進めます。評判が上がれば、新しい依頼が受けられます。', done: false, screen: 'dev' },
      ]);
  }
}
