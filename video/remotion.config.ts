import path from 'node:path'
import { Config } from '@remotion/cli/config'

Config.setVideoImageFormat('jpeg')
// snapcn files import "@/components/..." (shadcn alias); point it at this folder.
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), '@': path.resolve(process.cwd(), 'src') } },
}))
