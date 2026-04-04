import {describe, expect, it} from 'vitest';
import {extractConversationTitle, formatRelativeTime, getConversationDisplayTitle, QA_EMPTY_TITLE} from './conversation';

describe('conversation helpers', () => {
  it('extracts a short conversation title from the first sentence', () => {
    expect(extractConversationTitle('帮我总结最近上传的文档重点。顺便列个计划')).toBe('帮我总结最近上传的文档重点');
  });

  it('maps empty placeholder titles to localized new conversation labels', () => {
    expect(getConversationDisplayTitle(QA_EMPTY_TITLE, 'New Conversation', 'Default Conversation')).toBe('New Conversation');
    expect(getConversationDisplayTitle('默认会话', '新建会话', '默认会话')).toBe('默认会话');
  });

  it('formats invalid timestamps as just now', () => {
    expect(formatRelativeTime('invalid-date', 'en')).toBe('just now');
  });
});
