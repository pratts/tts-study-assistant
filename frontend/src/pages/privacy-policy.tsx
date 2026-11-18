import { Link } from 'react-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Public at /privacy-policy: linked from the extension popup and from the
// Chrome Web Store and Firefox Add-ons listings. Keep "What We Collect" in step
// with data_collection_permissions in extension/manifest.json.

type Section = { title: string; body: string; items?: string[] }

export const EFFECTIVE_DATE = '2026-11-18'

const SECTIONS: Section[] = [
  { title: 'Effective Date', body: EFFECTIVE_DATE },
  {
    title: 'Who We Are',
    body: 'TTS Study Assistant is a browser extension for Chrome and Firefox, together with this web dashboard and our backend server. This policy covers all three.',
  },
  {
    title: 'What We Collect',
    body: 'Only what you give us when you use a feature:',
    items: [
      'Account: your name, email address and password. The password is sent over an encrypted connection and stored only as a salted hash.',
      'Notes: text you select and save, the address (URL) and title of the page it came from, that site’s domain, and any summary you ask for.',
      'Sessions: login tokens. They are kept in your browser; our server keeps refresh tokens only as a hash, with whether the session is from the extension or the dashboard.',
      'Server logs: your IP address and the time, path and result of each request to our server, used to run the service and limit abuse.',
    ],
  },
  {
    title: 'What We Don’t Collect',
    body: 'The extension sends nothing until you act: it does not record your browsing history, the pages you visit, or what you type. To show “Notes from this site”, the popup compares the current site with your saved notes on your device and only asks our server for notes from a site you have already saved from. Your speech settings (speed, on/off) stay in your browser’s extension storage, which your browser may sync between your devices. We use no analytics, advertising or tracking.',
  },
  {
    title: 'How We Use Data',
    body: 'Your data is used solely to provide the TTS Study Assistant: saving, organizing, summarizing and reading notes aloud. Text is read aloud by your browser’s speech engine, not by our server; some voices offered by your browser or operating system are online services run by them. We do not sell your data or use it for advertising.',
  },
  {
    title: 'Who Else Receives It',
    body: 'When you ask for a summary, the note’s text is sent to our AI provider (currently OpenAI) to generate it; nothing else about you is sent. Our servers and database are run by our hosting providers. We share data with no one else, except where the law requires it.',
  },
  {
    title: 'Storage',
    body: 'Notes and account data are stored on our servers and sent only over encrypted connections. Login tokens stay in your browser until you log out or they expire.',
  },
  {
    title: 'Your Choices and Deleting Data',
    body: 'You can edit or delete any note at any time from the dashboard, or delete it from the extension, and logging out removes your login tokens from that browser. To delete your account and all its notes, email us at the address below. Uninstalling the extension removes its settings and tokens from your browser.',
  },
  {
    title: 'Extension Permissions',
    body: 'The extension (Chrome and Firefox) asks only for what its features need: storage (settings and login), text-to-speech (Chrome), active tab and scripting (reading the selection you save and adding the selection button), context menus (right-click actions), notifications (save and summary messages), and access to websites (the selection button on pages, and our server). You can limit website access in your browser at any time; the extension then asks before it runs on a site.',
  },
  {
    title: 'Changes',
    body: 'If this policy changes, we will update it here and change the effective date above.',
  },
  { title: 'Contact', body: 'For privacy questions or to delete your account, contact: prateeksharma.2801@gmail.com' },
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
          {SECTIONS.map(({ title, body, items }) => (
            <section key={title} aria-label={title}>
              <p>
                <strong>{title}:</strong> {body}
              </p>
              {items && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
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
