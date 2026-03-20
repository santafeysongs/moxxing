import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service & Privacy Policy — MOXX UP',
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  const lastUpdated = 'March 13, 2026';

  return (
    <main
      style={{
        maxWidth: 800,
        margin: '0 auto',
        padding: '80px 24px 120px',
        fontFamily: 'var(--font-body)',
        color: '#e0e0e0',
        lineHeight: 1.7,
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-unbounded)',
          fontSize: '2rem',
          fontWeight: 700,
          marginBottom: 8,
          color: '#fff',
        }}
      >
        Terms of Service
      </h1>
      <p style={{ color: '#888', marginBottom: 48, fontSize: '0.9rem' }}>
        Last updated: {lastUpdated}
      </p>

      <Section title="1. Acceptance of Terms">
        By accessing or using MOXX UP (&quot;the Service&quot;), operated by Andrew Thomas Reid
        (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these Terms of
        Service. If you do not agree, do not use the Service.
      </Section>

      <Section title="2. Description of Service">
        MOXX UP is a creative AI tool that enables users to generate visual content by combining
        subject photographs with reference imagery. The Service may utilize third-party APIs,
        including research APIs, to analyze cultural context, visual references, and publicly
        available data to enhance creative output.
      </Section>

      <Section title="3. User Responsibilities">
        <ul style={{ paddingLeft: 20 }}>
          <li>You must be at least 18 years old to use the Service.</li>
          <li>You are responsible for all content you upload or generate.</li>
          <li>You will not use the Service to create content that is illegal, defamatory, harassing,
            or infringes on the rights of others.</li>
          <li>You will not attempt to reverse-engineer, scrape, or misuse any APIs accessed through
            the Service.</li>
          <li>You will comply with all applicable laws and third-party terms of service.</li>
        </ul>
      </Section>

      <Section title="4. Intellectual Property">
        You retain ownership of content you upload. Generated outputs are provided under a
        non-exclusive license for personal and commercial use, subject to third-party API terms and
        applicable intellectual property law. We do not claim ownership of your generated content.
      </Section>

      <Section title="5. Data Usage & Research API Compliance">
        <ul style={{ paddingLeft: 20 }}>
          <li>Data accessed through research APIs is used solely for cultural context analysis and
            creative reference purposes.</li>
          <li>We do not sell, redistribute, or sublicense raw data obtained from research APIs.</li>
          <li>All API data is processed in compliance with the respective platform&apos;s terms of
            service and developer agreements.</li>
          <li>Cached or stored data is retained only as long as necessary for the Service&apos;s
            functionality and is purged on a regular basis.</li>
          <li>We do not use research API data for surveillance, advertising targeting, or political
            profiling.</li>
        </ul>
      </Section>

      <Section title="5a. TikTok Research API — Specific Provisions">
        In connection with our use of the TikTok Research API, the following additional terms apply:
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>TikTok data accessed via the Research API is used exclusively for non-commercial
            research purposes, specifically cultural trend analysis and creative context research.</li>
          <li>We will not attempt to re-identify any anonymized or de-identified TikTok user data.</li>
          <li>We will not sell, license, or otherwise commercially distribute any data obtained from
            the TikTok Research API.</li>
          <li>TikTok data will not be used to build surveillance tools, advertising profiles, or
            any tool that targets individuals based on race, ethnicity, religion, sexual orientation,
            or political affiliation.</li>
          <li>We will delete all TikTok Research API data upon expiration or termination of our API
            access, or upon request by TikTok.</li>
          <li>We will not share raw TikTok data with third parties. Any published findings will use
            only aggregated, anonymized, or sufficiently de-identified data.</li>
          <li>We comply with TikTok&apos;s Developer Terms of Service and Research API Terms at all
            times. In the event of a conflict between these terms and TikTok&apos;s terms,
            TikTok&apos;s terms shall prevail.</li>
          <li>We maintain reasonable security measures to protect all TikTok data from unauthorized
            access, disclosure, or misuse.</li>
        </ul>
      </Section>

      <Section title="6. Limitation of Liability">
        The Service is provided &quot;as is&quot; without warranties of any kind. We are not liable
        for any indirect, incidental, or consequential damages arising from your use of the Service.
        Our total liability shall not exceed the amount paid by you, if any, in the 12 months
        preceding the claim.
      </Section>

      <Section title="7. Termination">
        We may suspend or terminate your access at any time for violation of these terms or for any
        reason at our discretion. Upon termination, your right to use the Service ceases immediately.
      </Section>

      <Section title="8. Changes to Terms">
        We reserve the right to modify these terms at any time. Continued use of the Service after
        changes constitutes acceptance of the updated terms.
      </Section>

      <Divider />

      <h1
        style={{
          fontFamily: 'var(--font-unbounded)',
          fontSize: '2rem',
          fontWeight: 700,
          marginBottom: 8,
          color: '#fff',
        }}
      >
        Privacy Policy
      </h1>
      <p style={{ color: '#888', marginBottom: 48, fontSize: '0.9rem' }}>
        Last updated: {lastUpdated}
      </p>

      <Section title="1. Information We Collect">
        <ul style={{ paddingLeft: 20 }}>
          <li><strong>Uploaded Content:</strong> Photos and reference images you provide.</li>
          <li><strong>Usage Data:</strong> Anonymous analytics including page views and feature usage.</li>
          <li><strong>Account Information:</strong> Email address if you create an account.</li>
          <li><strong>API Data:</strong> Publicly available data accessed through authorized research
            APIs for cultural context analysis.</li>
        </ul>
      </Section>

      <Section title="2. How We Use Your Information">
        <ul style={{ paddingLeft: 20 }}>
          <li>To provide and improve the Service.</li>
          <li>To generate creative visual outputs based on your inputs.</li>
          <li>To analyze cultural context and visual references using authorized APIs.</li>
          <li>To communicate with you about the Service.</li>
        </ul>
      </Section>

      <Section title="3. Data Security">
        We implement industry-standard security measures to protect your data, including:
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>HTTPS encryption for all data in transit.</li>
          <li>Secure storage with access controls.</li>
          <li>Regular security reviews and updates.</li>
          <li>No plaintext storage of sensitive credentials.</li>
        </ul>
      </Section>

      <Section title="4. Data Sharing">
        We do not sell your personal information. We may share data only:
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>With third-party AI services to process your creative requests (e.g., image generation).</li>
          <li>When required by law or valid legal process.</li>
          <li>To protect our rights or the safety of users.</li>
        </ul>
      </Section>

      <Section title="5. Data Retention">
        Uploaded images are retained only for the duration needed to generate outputs. You may
        request deletion of your data at any time by contacting us. Research API data is cached
        temporarily and purged regularly.
      </Section>

      <Section title="6. Your Rights">
        You have the right to:
        <ul style={{ paddingLeft: 20, marginTop: 8 }}>
          <li>Access the personal data we hold about you.</li>
          <li>Request correction or deletion of your data.</li>
          <li>Opt out of non-essential data collection.</li>
          <li>Request a copy of your data in a portable format.</li>
        </ul>
      </Section>

      <Section title="7. Contact">
        For questions about these policies, contact:<br />
        <strong>Andrew Thomas Reid</strong><br />
        Email: andrew@andrewthomasreid.com
      </Section>

      <Divider />

      <p style={{ color: '#555', fontSize: '0.8rem', textAlign: 'center', marginTop: 60 }}>
        © {new Date().getFullYear()} Andrew Thomas Reid. All rights reserved.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2
        style={{
          fontFamily: 'var(--font-unbounded)',
          fontSize: '1.1rem',
          fontWeight: 600,
          marginBottom: 12,
          color: '#fff',
        }}
      >
        {title}
      </h2>
      <div style={{ color: '#bbb' }}>{children}</div>
    </section>
  );
}

function Divider() {
  return (
    <hr
      style={{
        border: 'none',
        borderTop: '1px solid #333',
        margin: '60px 0',
      }}
    />
  );
}
