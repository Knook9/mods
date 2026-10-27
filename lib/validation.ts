export type SubmissionInput = {
  title: string;
  game: string;
  gameGenre: string;
  category: string;
  description: string;
  imageUrl: string | null;
  downloadUrl: string;
  author: string;
  version: string | null;
};

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const validGameGenres = new Set([
  "Sandbox",
  "Adventure",
  "RPG",
  "Simulation",
  "Strategy",
  "Survival",
  "Action",
  "Horror",
  "Roguelike",
]);

function validExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateSubmission(input: unknown):
  | { value: SubmissionInput }
  | { error: string } {
  if (!input || typeof input !== "object") return { error: "بيانات الإرسال غير صالحة." };
  const data = input as Record<string, unknown>;
  const title = text(data.title, 100);
  const game = text(data.game, 80);
  const gameGenre = text(data.gameGenre, 30);
  const category = text(data.category, 50);
  const description = text(data.description, 2000);
  const author = text(data.author, 80);
  const downloadUrl = text(data.downloadUrl, 2048);
  const imageUrl = text(data.imageUrl, 2048);
  const version = text(data.version, 40);

  if (!title || !game || !gameGenre || !category || !description || !author || !downloadUrl) {
    return { error: "يرجى تعبئة جميع الحقول المطلوبة." };
  }
  if (!validGameGenres.has(gameGenre)) {
    return { error: "اختر نوعًا صحيحًا للعبة." };
  }
  if (!validExternalUrl(downloadUrl)) {
    return { error: "رابط التنزيل يجب أن يبدأ بـ https://." };
  }
  if (imageUrl && !validExternalUrl(imageUrl)) {
    return { error: "رابط الصورة يجب أن يكون صالحًا ويبدأ بـ https://." };
  }
  return {
    value: {
      title,
      game,
      gameGenre,
      category,
      description,
      author,
      downloadUrl,
      imageUrl: imageUrl || null,
      version: version || null,
    },
  };
}
