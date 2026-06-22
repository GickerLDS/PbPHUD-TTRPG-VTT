import express from 'express';
import nodemailer from 'nodemailer';
import { z } from 'zod';
import { verifyRecaptcha } from '../auth.js';
import { config } from '../env.js';
import { validate } from '../validation.js';

export const contactRouter = express.Router();

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(10).max(5000),
  recaptchaToken: z.string().max(4000).optional()
});

contactRouter.post('/', async (req, res, next) => {
  try {
    const body = validate(contactSchema, req.body);
    const recaptchaOk = await verifyRecaptcha(body.recaptchaToken, req.ip, 'contact');
    if (!recaptchaOk) {
      res.status(400).json({ error: 'reCAPTCHA verification failed' });
      return;
    }

    if (!config.email.contactTo) {
      res.status(503).json({ error: 'Contact form recipient is not configured' });
      return;
    }

    if (!config.email.smtp.auth.user || !config.email.smtp.auth.pass) {
      res.status(503).json({ error: 'SMTP is not configured' });
      return;
    }

    const transporter = nodemailer.createTransport(config.email.smtp);
    await transporter.sendMail({
      from: config.email.from,
      to: config.email.contactTo,
      replyTo: `${body.name} <${body.email}>`,
      subject: `[PBPHUD Contact] ${body.subject}`,
      text: [
        `Name: ${body.name}`,
        `Email: ${body.email}`,
        '',
        body.message
      ].join('\n'),
      html: `
        <p><strong>Name:</strong> ${escapeHtml(body.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(body.email)}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(body.message).replaceAll('\n', '<br>')}</p>
      `
    });

    res.json({ ok: true, message: 'Your message has been sent.' });
  } catch (error) {
    next(error);
  }
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
