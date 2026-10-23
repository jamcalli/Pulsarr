import type { BaseLayoutProps } from '@fumadocs/base-ui/layouts/shared';
import Image from 'next/image';
import pulsarrLogo from '@/assets/images/pulsarr.svg';
import { appName, gitConfig } from './shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image src={pulsarrLogo} alt="" className="size-5" />
          {appName}
        </>
      ),
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
