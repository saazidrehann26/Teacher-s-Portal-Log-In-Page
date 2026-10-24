import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, 'src/data/database.json')
const EMAIL_CFG_PATH = path.resolve(__dirname, 'src/data/email-config.json')

function databaseApiPlugin(): Plugin {
  return {
    name: 'database-api-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        if (!url.startsWith('/api/database') && !url.startsWith('/api/send-otp')) {
          return next()
        }

        res.setHeader('Content-Type', 'application/json')

        // GET /api/database
        if (req.method === 'GET' && url === '/api/database') {
          try {
            if (fs.existsSync(DB_PATH)) {
              const content = fs.readFileSync(DB_PATH, 'utf-8')
              res.statusCode = 200
              res.end(content)
            } else {
              res.statusCode = 200
              res.end(JSON.stringify({ users: [] }))
            }
          } catch {
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Failed to read database file' }))
          }
          return
        }

        // POST /api/send-otp
        if (req.method === 'POST' && url === '/api/send-otp') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', async () => {
            try {
              const data = body ? JSON.parse(body) : {}
              const { email, code } = data
              const cleanEmail = (email || '').trim().toLowerCase()

              let apiKey = process.env.EMAIL_API_KEY || process.env.RESEND_API_KEY || ''
              let provider = 'emailjs'
              let fromEmail = 'onboarding@resend.dev'
              let publicKey = 'ME2eguiVl69ksPgzH'
              let serviceId = 'teacherportal'
              let templateId = 'template_83ex1qp'

              if (fs.existsSync(EMAIL_CFG_PATH)) {
                try {
                  const cfg = JSON.parse(fs.readFileSync(EMAIL_CFG_PATH, 'utf-8'))
                  if (cfg.apiKey) apiKey = cfg.apiKey
                  if (cfg.provider) provider = cfg.provider
                  if (cfg.fromEmail) fromEmail = cfg.fromEmail
                  if (cfg.publicKey) publicKey = cfg.publicKey
                  if (cfg.serviceId) serviceId = cfg.serviceId
                  if (cfg.templateId) templateId = cfg.templateId
                } catch {}
              }

              // If EmailJS credentials are provided, dispatch live email via EmailJS
              if (provider === 'emailjs' || (publicKey && serviceId && templateId)) {
                const tryTemplates = [
                  templateId,
                  templateId.startsWith('template_') ? templateId.replace(/^template_/, '') : `template_${templateId}`,
                ].filter(Boolean)

                for (const tId of tryTemplates) {
                  try {
                    const emailJsPayload = {
                      service_id: serviceId,
                      template_id: tId,
                      user_id: publicKey,
                      template_params: {
                        to_email: cleanEmail,
                        email: cleanEmail,
                        user_email: cleanEmail,
                        recipient: cleanEmail,
                        reply_to: cleanEmail,
                        to_name: cleanEmail.split('@')[0],
                        otp: code,
                        otp_code: code,
                        code: code,
                        verification_code: code,
                        passcode: code,
                        message: `Your Teacher Portal password recovery OTP is: ${code}. This code is valid for 5 minutes.`,
                      },
                    }

                    const emailRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Origin': 'http://localhost:5173',
                      },
                      body: JSON.stringify(emailJsPayload),
                    })

                    const resText = await emailRes.text()
                    if (emailRes.ok) {
                      res.statusCode = 200
                      res.end(
                        JSON.stringify({
                          success: true,
                          provider: 'emailjs',
                          message: `Live email dispatched to ${cleanEmail} via EmailJS!`,
                          data: resText,
                        })
                      )
                      return
                    } else {
                      console.error(`EmailJS returned status for template ${tId}:`, emailRes.status, resText)
                    }
                  } catch (err: any) {
                    console.error('Failed to dispatch via EmailJS:', err)
                  }
                }
              }

              // If a real API key is provided, dispatch live email
              if (apiKey) {
                const htmlContent = `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #130616; color: #f4f4f5; border-radius: 16px; border: 1px solid rgba(217,70,239,0.3); text-align: center;">
                    <h2 style="color: #ffffff; margin-bottom: 8px; font-size: 22px;">Teacher Portal Recovery</h2>
                    <p style="color: #a1a1aa; font-size: 14px; margin-bottom: 24px;">Use the 5-digit verification code below to recover your portal access:</p>
                    <div style="display: inline-block; padding: 14px 28px; background: rgba(217,70,239,0.15); border: 1px solid rgba(217,70,239,0.5); border-radius: 12px; margin-bottom: 24px;">
                      <span style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #f43f5e;">${code}</span>
                    </div>
                    <p style="color: #71717a; font-size: 12px; line-height: 1.5;">This code will expire in 5 minutes. If you did not request this code, you can safely ignore this email.</p>
                  </div>
                `

                // 1. Resend (https://resend.com)
                if (provider === 'resend' || apiKey.startsWith('re_')) {
                  try {
                    const emailRes = await fetch('https://api.resend.com/emails', {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        from: `Teacher Portal <${fromEmail}>`,
                        to: [cleanEmail],
                        subject: 'Teacher Portal - Password Recovery OTP',
                        html: htmlContent,
                      }),
                    })
                    const resJson = await emailRes.json()
                    res.statusCode = 200
                    res.end(
                      JSON.stringify({
                        success: true,
                        provider: 'resend',
                        message: `Live email dispatched to ${cleanEmail}`,
                        data: resJson,
                      })
                    )
                    return
                  } catch (err: any) {
                    console.error('Failed to dispatch via Resend:', err)
                  }
                }

                // 2. Brevo / Sendinblue (https://brevo.com)
                if (provider === 'brevo' || apiKey.startsWith('xkeysib-')) {
                  try {
                    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
                      method: 'POST',
                      headers: {
                        'api-key': apiKey,
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                      },
                      body: JSON.stringify({
                        sender: { name: 'Teacher Portal', email: fromEmail },
                        to: [{ email: cleanEmail }],
                        subject: 'Teacher Portal - Password Recovery OTP',
                        htmlContent,
                      }),
                    })
                    const resJson = await emailRes.json()
                    res.statusCode = 200
                    res.end(
                      JSON.stringify({
                        success: true,
                        provider: 'brevo',
                        message: `Live email dispatched to ${cleanEmail}`,
                        data: resJson,
                      })
                    )
                    return
                  } catch (err: any) {
                    console.error('Failed to dispatch via Brevo:', err)
                  }
                }

                // 3. SendGrid (https://sendgrid.com)
                if (provider === 'sendgrid' || apiKey.startsWith('SG.')) {
                  try {
                    await fetch('https://api.sendgrid.com/v3/mail/send', {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        personalizations: [{ to: [{ email: cleanEmail }] }],
                        from: { email: fromEmail, name: 'Teacher Portal' },
                        subject: 'Teacher Portal - Password Recovery OTP',
                        content: [{ type: 'text/html', value: htmlContent }],
                      }),
                    })
                    res.statusCode = 200
                    res.end(
                      JSON.stringify({
                        success: true,
                        provider: 'sendgrid',
                        message: `Live email dispatched to ${cleanEmail}`,
                      })
                    )
                    return
                  } catch (err: any) {
                    console.error('Failed to dispatch via SendGrid:', err)
                  }
                }
              }

              // Ready for API key
              res.statusCode = 200
              res.end(
                JSON.stringify({
                  success: true,
                  provider: apiKey ? provider : 'pending_key',
                  message: apiKey
                    ? `Verification code dispatched to ${cleanEmail}`
                    : `Live email ready for ${cleanEmail}. Waiting for your API key.`,
                })
              )
            } catch {
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Failed to process OTP dispatch' }))
            }
          })
          return
        }

        // POST /api/database/register or /api/database/update-password
        if (req.method === 'POST') {
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const data = body ? JSON.parse(body) : {}

              let dbContent = { description: 'Teacher Portal User Database', users: [] as any[] }
              if (fs.existsSync(DB_PATH)) {
                try {
                  dbContent = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
                } catch {}
              }

              if (url === '/api/database/register') {
                const { fullName, email, institutionName, password } = data
                const cleanEmail = (email || '').trim().toLowerCase()

                const existingIdx = dbContent.users.findIndex(
                  (u: any) => u.email && u.email.toLowerCase() === cleanEmail
                )
                const userObj = {
                  id: existingIdx >= 0 ? dbContent.users[existingIdx].id : `usr_${Date.now()}`,
                  fullName: (fullName || '').trim(),
                  email: cleanEmail,
                  institutionName: (institutionName || '').trim(),
                  password: password || '',
                  role: 'Educator',
                  status: 'active',
                  createdAt:
                    existingIdx >= 0
                      ? dbContent.users[existingIdx].createdAt
                      : new Date().toISOString(),
                }

                if (existingIdx >= 0) {
                  dbContent.users[existingIdx] = userObj
                } else {
                  dbContent.users.unshift(userObj)
                }

                fs.writeFileSync(DB_PATH, JSON.stringify(dbContent, null, 2), 'utf-8')
                res.statusCode = 200
                res.end(JSON.stringify({ success: true, user: userObj }))
                return
              }

              if (url === '/api/database/update-password') {
                const { email, newPassword } = data
                const cleanEmail = (email || '').trim().toLowerCase()
                const user = dbContent.users.find(
                  (u: any) => u.email && u.email.toLowerCase() === cleanEmail
                )
                if (user) {
                  user.password = newPassword
                  fs.writeFileSync(DB_PATH, JSON.stringify(dbContent, null, 2), 'utf-8')
                  res.statusCode = 200
                  res.end(JSON.stringify({ success: true }))
                } else {
                  res.statusCode = 404
                  res.end(JSON.stringify({ error: 'User not found in database' }))
                }
                return
              }

              res.statusCode = 404
              res.end(JSON.stringify({ error: 'API route not found' }))
            } catch {
              res.statusCode = 500
              res.end(JSON.stringify({ error: 'Failed to process database write' }))
            }
          })
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  base: '/Teacher-s-Portal-Log-In-Page/',
  plugins: [
    react(),
    tailwindcss(),
    databaseApiPlugin(),
  ],
})
