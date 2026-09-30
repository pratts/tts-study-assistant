import { Link } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const SECTIONS: { title: string; body: string }[] = [
  { title: 'Effective Date', body: '2024-06-01' },
  {
    title: 'What We Collect',
    body: 'We collect your email address and password for authentication. Your password is sent over an encrypted connection and stored only as a salted hash. When you save a note, the selected website content and its source URL are sent to our backend. No other personal, health, financial, or activity data is collected.',
  },
  {
    title: 'How We Use Data',
    body: 'Your data is used solely to provide the core features of the TTS Study Assistant: saving, organizing, and reading notes aloud. We do not sell or share your data with third parties.',
  },
  {
    title: 'Storage',
    body: 'Notes and account data are stored securely on our servers. Authentication tokens are stored in your browser for session management.',
  },
  {
    title: 'User Rights',
    body: 'You may delete your notes or account at any time. Contact support for account deletion requests.',
  },
  {
    title: 'Extension Permissions',
    body: 'The Chrome extension requests permissions only to access selected text, context menus, and text-to-speech features. No browsing history or personal communications are accessed.',
  },
  { title: 'Contact', body: 'For privacy questions, contact: prateeksharma.2801@gmail.com' },
]

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl p-4 md:p-10">
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="text-2xl font-bold">Privacy Policy</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm leading-relaxed">
          {SECTIONS.map(({ title, body }) => (
            <p key={title}>
              <strong>{title}:</strong> {body}
            </p>
          ))}
          <p>
            <Link to="/" className="underline underline-offset-4">
              Back to the app
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
