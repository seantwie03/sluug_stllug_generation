import { RunnableToolFunctionWithParse } from "openai/lib/RunnableFunction";
import { JSONSchema } from "openai/lib/jsonschema";
import { ZodSchema, z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const meetingTypeSchema = z.enum(["SLUUG", "STLLUG"]);
export type MeetingType = z.infer<typeof meetingTypeSchema>;

export const linkSchema = z.object({
    url: z
        .string()
        .describe("URL to the reference. Example: 'https://linux.die.net/man/1/whereis'"),
    linkText: z
        .string()
        .optional()
        .describe("The display name of the link. Example: 'whereis man page'"),
});
export type Link = z.infer<typeof linkSchema>;

export const imageSchema = z.object({
    src: z.string(),
    alt: z.string(),
});
export type Image = z.infer<typeof imageSchema>;

export const presentationSchema = z.object({
    title: z.string(),
    presenterNames: z.array(z.string()),
    abstract: z.string(),
    references: z.array(linkSchema).optional(),
    tags: z.array(z.string()).optional(),
    tweets: z.array(z.string()).optional(),
});
export type Presentation = z.infer<typeof presentationSchema>;

export const meetingSchema = z.object({
    meetingDate: z.coerce.date().optional(),
    meetingType: meetingTypeSchema.optional(),
    presentations: z.array(presentationSchema).min(1),
    meetupUrl: z.string().optional(),
    youtubeUrl: z.string().optional(),
    youtubeTitles: z.array(z.string()).optional(),
    image: z.array(imageSchema).optional(),
});
export type Meeting = z.infer<typeof meetingSchema>;

export const tweetToolParamsSchema = z.object({
    tweets: z
        .array(z.string())
        .length(3)
        .describe("An array of 3 short and enthusiastic tweets that summarize the presentation."),
});
export type TweetToolParams = z.infer<typeof tweetToolParamsSchema>;

export const tagToolParamsSchema = z.object({
    tags: z
        .array(z.string())
        .max(3)
        .describe(
            "An array of 3 or less tags or categories this presentation should be filed under."
        ),
});
export type TagToolParams = z.infer<typeof tagToolParamsSchema>;

export const youTubeTitleToolParamsSchema = z.object({
    titles: z
        .array(z.string())
        .length(3)
        .describe(
            "An array of 3 three Titles for recording of the presentation(s) that will be posted to YouTube."
        ),
});
export type YouTubeTitleToolParams = z.infer<typeof youTubeTitleToolParamsSchema>;

export const imageDesignsToolParamsSchema = z.object({
    designs: z
        .array(z.string())
        .length(3)
        .describe("An array of 3 design ideas for an image to represent the presentation(s)."),
});
export type ImageDesignsToolParams = z.infer<typeof imageDesignsToolParamsSchema>;

/**
 * A generic utility function that returns a RunnableFunction
 * you can pass to `.runTools()`, with a fully validated, typesafe parameters schema.
 *
 */
export function zodFunction<T extends object>({
    function: fn,
    schema,
    description = "",
    name,
}: {
    function: (args: T) => string[];
    schema: ZodSchema<T>;
    description?: string;
    name?: string;
}): RunnableToolFunctionWithParse<T> {
    return {
        type: "function",
        function: {
            function: fn,
            name: name ?? fn.name,
            description: description,
            parameters: zodToJsonSchema(schema) as JSONSchema,
            parse(input: string): T {
                const obj = JSON.parse(input);
                return schema.parse(obj);
            },
        },
    };
}
