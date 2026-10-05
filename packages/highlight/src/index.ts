import ts from '../grammars/twill.tmLanguage.json';
import tsx from '../grammars/twillx.tmLanguage.json';

/** The TextMate rule fields used by Twill, independent of an engine's types. */
export interface TextMateRule {
  name?: string;
  include?: string;
  match?: string;
  begin?: string;
  end?: string;
  captures?: Record<string, TextMateRule>;
  beginCaptures?: Record<string, TextMateRule>;
  endCaptures?: Record<string, TextMateRule>;
  patterns?: TextMateRule[];
}

export interface TwillGrammar {
  name: string;
  aliases: string[];
  scopeName: string;
  patterns: TextMateRule[];
  repository: Record<string, TextMateRule>;
  injections: Record<string, TextMateRule>;
}

/** Engine-independent TextMate grammars; load the TS/TSX base grammars too. */
export const twill: TwillGrammar = { ...ts, name: 'twill', aliases: ['Twill'] };
export const twillx: TwillGrammar = { ...tsx, name: 'twillx', aliases: ['TwillX'] };
export const twillLanguages = [twill, twillx];
