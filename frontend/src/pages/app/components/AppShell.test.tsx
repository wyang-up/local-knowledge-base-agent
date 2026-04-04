import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {AppShell} from './AppShell';

describe('AppShell', () => {
  it('renders app navigation and routes settings actions', () => {
    const onTabChange = vi.fn();

    render(
      <AppShell
        activeTab="documents"
        currentView="list"
        isDarkTheme={false}
        locale={{appTitle: '本地知识库', tabDocs: '文档库', tabQa: '问答', tabSettings: '设置'}}
        onTabChange={onTabChange}
      >
        <div>content</div>
      </AppShell>,
    );

    expect(screen.getByText('本地知识库')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', {name: '设置'})[0]);
    fireEvent.click(screen.getByRole('button', {name: '问答'}));

    expect(onTabChange).toHaveBeenCalledWith('settings');
    expect(onTabChange).toHaveBeenCalledWith('qa');
  });
});
