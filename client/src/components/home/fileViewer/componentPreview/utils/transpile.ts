import * as Babel from "@babel/standalone";

export type TranspileResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

/**
 * Транспилирует JSX/TSX/TS/JS исходник в ES5-совместимый JS.
 * Убирает все import/export — код будет выполняться в iframe runtime,
 * где нужные зависимости уже доступны как глобалы.
 */
export const transpileSource = (source: string): TranspileResult => {
  try {
    const result = Babel.transform(source, {
      presets: [
        ["react", { runtime: "classic" }],
        ["typescript", { allExtensions: true, isTSX: true }],
      ],
      plugins: [
        // Убираем все import — заменяем глобальными переменными
        "transform-modules-commonjs",
      ],
      filename: "component.tsx",
    });

    if (!result?.code) {
      return { ok: false, error: "Babel вернул пустой результат" };
    }

    return { ok: true, code: result.code };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
};
