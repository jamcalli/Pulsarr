import React, { useEffect, useState } from 'react';
import Layout from '@theme/Layout';

export default function VerifyFontFiles(): JSX.Element {
  const [results, setResults] = useState<string[]>([]);

  useEffect(() => {
    const verifyFonts = async () => {
      const logs: string[] = [];
      
      // Check what's actually being served
      const paths = [
        '/fonts/Shuttleblock-Medium.woff2',
        '/static/fonts/Shuttleblock-Medium.woff2',
      ];
      
      for (const path of paths) {
        logs.push(`\n=== Testing ${path} ===`);
        try {
          const response = await fetch(path);
          logs.push(`Status: ${response.status}`);
          logs.push(`Content-Type: ${response.headers.get('Content-Type')}`);
          
          // Check if it's HTML (error page) or actual font
          const contentType = response.headers.get('Content-Type') || '';
          if (contentType.includes('html')) {
            const text = await response.text();
            logs.push('ERROR: Received HTML instead of font file');
            logs.push(`First 200 chars: ${text.substring(0, 200)}...`);
          } else {
            const blob = await response.blob();
            logs.push(`File size: ${blob.size} bytes`);
            
            // Read first few bytes to verify it's a font
            const buffer = await blob.slice(0, 4).arrayBuffer();
            const view = new DataView(buffer);
            const signature = view.getUint32(0, false);
            logs.push(`File signature: 0x${signature.toString(16).toUpperCase()}`);
            logs.push(`Expected WOFF2: 0x774F4632`);
          }
        } catch (error) {
          logs.push(`Error: ${error}`);
        }
      }
      
      setResults(logs);
    };
    
    verifyFonts();
  }, []);

  return (
    <Layout>
      <main style={{ padding: '2rem' }}>
        <h1>Font File Verification</h1>
        
        <pre style={{ 
          backgroundColor: '#f5f5f5', 
          padding: '1rem',
          overflow: 'auto'
        }}>
          {results.join('\n')}
        </pre>
        
        <div style={{ marginTop: '2rem' }}>
          <h2>Direct Links</h2>
          <ul>
            <li><a href="/fonts/Shuttleblock-Medium.woff2" target="_blank">/fonts/Shuttleblock-Medium.woff2</a></li>
            <li><a href="/static/fonts/Shuttleblock-Medium.woff2" target="_blank">/static/fonts/Shuttleblock-Medium.woff2</a></li>
          </ul>
        </div>
      </main>
    </Layout>
  );
}