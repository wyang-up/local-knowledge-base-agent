import {format} from 'date-fns';

export const QA_EMPTY_TITLE = '新会话';

export function extractConversationTitle(question: string) {
  const cleaned = question.replace(/\s+/g, ' ').trim();
  if (!cleaned) return QA_EMPTY_TITLE;
  const firstSentence = cleaned.split(/[。！？!?;；\n]/)[0].trim();
  return (firstSentence || cleaned).slice(0, 18);
}

export function formatRelativeTime(iso: string, language: 'zh' | 'en') {
  const target = new Date(iso);
  const targetMs = target.getTime();
  if (!Number.isFinite(targetMs)) return language === 'en' ? 'just now' : '刚刚';

  const now = new Date();
  const diffMs = now.getTime() - targetMs;
  if (!Number.isFinite(diffMs) || diffMs < 0) return language === 'en' ? 'just now' : '刚刚';

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTargetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();

  if (diffMs < minute) return language === 'en' ? 'just now' : '刚刚';
  if (diffMs < hour) return language === 'en' ? `${Math.floor(diffMs / minute)}m ago` : `${Math.floor(diffMs / minute)}分钟前`;
  if (startOfTargetDay === startOfToday) return language === 'en' ? `Today ${format(target, 'HH:mm')}` : `今天 ${format(target, 'HH:mm')}`;
  if (startOfTargetDay === startOfToday - day) return language === 'en' ? 'Yesterday' : '昨天';
  return language === 'en' ? `${Math.floor(diffMs / day)}d ago` : `${Math.floor(diffMs / day)}天前`;
}

export function getConversationDisplayTitle(title: string, newConversationLabel: string, defaultConversationLabel: string) {
  if (title === QA_EMPTY_TITLE || title === 'New Conversation' || title === '新建会话') {
    return newConversationLabel;
  }
  if (title === '默认会话' || title === 'Default Conversation') {
    return defaultConversationLabel;
  }
  return title;
}
