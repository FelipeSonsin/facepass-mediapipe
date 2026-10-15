// Validação e comparação de nomes.

export const NAME_MIN = 2
export const NAME_MAX = 60
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u

export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** Retorna a mensagem de erro, ou null se o nome for válido. */
export function validateName(raw: string): string | null {
  const name = normalizeName(raw)
  if (!name) return 'Informe o nome da pessoa.'
  if (name.length < NAME_MIN) return `Use pelo menos ${NAME_MIN} letras.`
  if (name.length > NAME_MAX) return `Use no máximo ${NAME_MAX} caracteres.`
  if (!NAME_PATTERN.test(name)) return 'Use apenas letras, espaços, apóstrofo ou hífen.'
  return null
}

export function sameName(a: string, b: string): boolean {
  const key = (s: string) => normalizeName(s).toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{M}/gu, '')
  return key(a) === key(b)
}
