import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { LocaleProvider, useLocale } from './LocaleContext'

function Sample() {
  const { t } = useLocale()
  return <><LanguageSwitcher /><h1>{t('landing.title1')}</h1><p>{t('register.title')}</p></>
}

describe('LocaleProvider', () => {
  beforeEach(() => localStorage.clear())

  it('uses English by default and persists an explicit language choice', () => {
    render(<LocaleProvider><Sample /></LocaleProvider>)
    expect(screen.getByRole('heading')).toHaveTextContent('Clearer interviews.')
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'zh-CN' } })
    expect(screen.getByRole('heading')).toHaveTextContent('更清晰的面试。')
    expect(screen.getByText('您将如何使用 CyberVett？')).toBeInTheDocument()
    expect(localStorage.getItem('cybervett_locale')).toBe('zh-CN')

    fireEvent.change(screen.getByLabelText('语言'), { target: { value: 'ms' } })
    expect(screen.getByText('Bagaimanakah anda akan menggunakan CyberVett?')).toBeInTheDocument()
  })
})
