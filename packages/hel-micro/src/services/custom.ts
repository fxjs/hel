import { DEFAULT_ONLINE_VER, log } from '../deps/helMicroCore';
import type { ICustom, IInnerPreFetchOptions } from '../types';
import { noop, requestGet } from '../util';

const type2conf = {
  js: {
    endMark: '.js',
    reg: '(?<=(src="))[^"]*?(?=")',
    tag: 'script',
    attrKey: 'src',
  },
  css: {
    endMark: '.css',
    reg: '(?<=(href="))[^"]*?(?=")',
    tag: 'link',
    attrKey: 'href',
  },
};

const inner = {
  extractAssetList(htmlText: string, options: { host: string; type: 'js' | 'css' }) {
    // TODO: 分析 script style 内部文本（现阶段暂不支持内部文本）
    // const arr = Array.from(htmlText.matchAll(new RegExp('(?<=\<script\>).*?(?=(\</script\>|$))', 'g')));
    // arr.forEach(item=> console.log(item[0])); // item[0] 即内部文本

    const { host, type } = options;
    const { endMark, tag, reg, attrKey } = type2conf[type];

    // 此处不能采用 const reg = /(?<=(src="))[^"]*?(?=")/ig 写法，谨防 safari 浏览器报错
    // SyntaxError: Invalid regular expression: invalid group specifier name
    const assetReg = new RegExp(reg, 'ig');
    const rawList = htmlText.match(assetReg) || [];
    const targetList: any[] = [];

    rawList.forEach((v) => {
      if (!v.startsWith(host)) return;
      if (!v.endsWith(endMark)) return;
      targetList.push({ tag, attrs: { [attrKey]: v } });
    });
    return targetList;
  },
  extractCssList(htmlText: string, host: string) {
    const cssList = inner.extractAssetList(htmlText, { host, type: 'css' });
    return cssList;
  },
  extractScriptList(htmlText: string, host: string) {
    const jsList = inner.extractAssetList(htmlText, { host, type: 'js' });
    return jsList;
  },
};

export function isCustomValid(custom: IInnerPreFetchOptions['custom']): custom is ICustom {
  if (custom) {
    const { enable = true, host } = custom;
    return !!(host && enable);
  }
  return false;
}

export async function getCustomMeta(appName: string, custom: ICustom) {
  const { host, appGroupName, skipFetchHelMeta = false } = custom;
  const t = Date.now();
  if (!skipFetchHelMeta) {
    try {
      const { reply } = await requestGet(`${host}/hel-meta.json?_t=${t}`);
      if (reply) {
        reply.app.__fromCust = true;
        return reply;
      }
      log('[[ getCustomMeta ]] 404 is a expected behavior for custom mode, user can ignore it');
    } catch (err: any) {
      noop('json parse fail or other error');
    }
  }

  const result = await requestGet(`${host}/index.html?_t=${t}`, false);
  const htmlText = result.reply;
  const cssList = inner.extractCssList(htmlText, host);
  const jsList = inner.extractScriptList(htmlText, host);
  const bodyAssetList = cssList.concat(jsList);

  return {
    app: {
      // @ts-ignore，标记来自 cust 配置
      __fromCust: true,
      name: appName,
      app_group_name: appGroupName || appName,
      online_version: DEFAULT_ONLINE_VER,
      build_version: DEFAULT_ONLINE_VER,
    },
    version: {
      sub_app_name: appName,
      sub_app_version: DEFAULT_ONLINE_VER,
      src_map: {
        headAssetList: [],
        bodyAssetList,
      },
    },
  };
}