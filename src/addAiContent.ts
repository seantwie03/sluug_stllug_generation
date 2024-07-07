import { FileHandle, open, writeFile } from "node:fs/promises";
import https from "node:https";
import path, { dirname, resolve } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import sharp from "sharp";
import { sluugDescription } from "./constants.js";
import {
    Image,
    Meeting,
    MeetingType,
    Presentation,
    TagToolParams,
    TweetToolParams,
    YouTubeTitleToolParams,
    meetingSchema,
    tagToolParamsSchema,
    tweetToolParamsSchema,
    youTubeTitleToolParamsSchema,
    zodFunction,
} from "./models.js";

/**
 * Logs detailed information to the console, if verbose logging is enabled.
 * This function checks the global verbose flag and, if set, outputs the provided message.
 *
 * @param message The message to log.
 */
export function verboseLog(...args: unknown[]) {
    if (isVerbose) {
        args.forEach((arg) => {
            if (Array.isArray(arg)) {
                arg.forEach((element) => verboseLog(element));
            } else if (typeof arg === "object") {
                console.dir(arg, { depth: null });
            } else {
                console.log(arg);
            }
        });
    }
}

function extractInputFilePathFromArgs(): string {
    if (argv.length < 3) {
        throw new Error(
            "No file path provided. You must supply the path to a JSON file as an argument."
        );
    }
    return argv[2];
}

function extractApiKeyFromEnv(): string {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("Environment Variable: OPENAI_API_KEY not found.");
    }
    return process.env.OPENAI_API_KEY;
}

async function openMeetingFile(filePath: string): Promise<FileHandle> {
    try {
        return open(filePath);
    } catch (error) {
        console.error(`Error reading JSON Meeting file: ${filePath}`);
        throw error;
    }
}

async function parseMeetingFile(file: FileHandle): Promise<Meeting> {
    try {
        const jsonBuffer = await file.readFile();
        return { ...meetingSchema.parse(JSON.parse(jsonBuffer.toString())) };
    } catch (error) {
        console.error(`Error parsing JSON Meeting file: ${inputFilePath}`);
        throw error;
    } finally {
        file.close();
    }
}

function convertPresentationToPrompt(
    presentation: Presentation,
    includePresenters = false,
    meetingDate?: string
): string {
    return `${meetingDate ? `This presentation will be given on: ${meetingDate}` : ""}.
    The title of the presentation is: ${presentation.title}.
    ${includePresenters ? `The presenter(s) are: ${presentation.presenterNames.join()}.` : ""}
    This presentation abstract is as follows: ${presentation.abstract}
    ${presentation.tags ? `Tags: ${presentation.tags.join()}` : ""}`;
}

function convertPresentationsToPrompt(
    presentations: Presentation[],
    includePresenters = false,
    meetingDate?: string
): string {
    return presentations
        .map((presentation) =>
            convertPresentationToPrompt(presentation, includePresenters, meetingDate)
        )
        .join("\n");
}

/**
 * This function is used to ensure the AI returns tags in proper JSON format. As of now, the easiest way to make the
 * OpenAI API return JSON that matches a specific schema is to have it call a function that takes the specific schema as
 * it's parameter. This function only exists to 'force' OpenAI API to return valid JSON.
 *
 * @param args Contains an array of tags the presentation should be filed under.
 *             The Params has to be type Object due  to limitation with the OpenAI API.
 * @returns an array of tags for this presentation in lower-kebab-case.
 */
function tagTool(args: TagToolParams): string[] {
    return args.tags.map((tag) => tag.trimStart().trimEnd().replace(" ", "-").toLowerCase());
}

async function generateTags(openAi: OpenAI, presentation: Presentation): Promise<Presentation> {
    console.log("Calling OpenAI API to generate tags for presentation:", presentation.title);
    const result = await openAi.beta.chat.completions
        .runTools({
            model: "gpt-4o",
            tools: [
                zodFunction({
                    function: tagTool,
                    schema: tagToolParamsSchema,
                    description:
                        "Call this function to create tags or categories this presentation should be filed under.",
                }),
            ],
            tool_choice: {
                type: "function",
                function: {
                    name: "tagTool",
                },
            },
            messages: [
                {
                    role: "system",
                    content:
                        sluugDescription +
                        "Please generate one or two tags this presentation should be filed under. Each tag should only consist of one or two words. Each tag should be singular. Include the main technique, technology, or concept this presentation is about. Then call the tagTool to create the tags.",
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: convertPresentationToPrompt(presentation),
                        },
                    ],
                },
            ],
            temperature: 1,
            max_tokens: 256,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        })
        .finalFunctionCallResult();
    if (!result) {
        throw new Error("OpenAI did not call the tool.");
    }
    return { ...presentation, tags: JSON.parse(result) as string[] };
}

/**
 * This function is used to ensure the AI returns tweets in proper JSON format. As of now, the easiest way to make the
 * OpenAI API return JSON that matches a specific schema is to have it call a function that takes the specific schema as
 * it's parameter. This function only exists to 'force' OpenAI API to return valid JSON.
 *
 * @param args Contains an array of short and enthusiastic tweets that summarize the presentation.
 *             The Params has to be type Object due  to limitation with the OpenAI API.
 * @returns an array of short and enthusiastic tweets that summarize the presentation.
 */
function tweetTool(args: TweetToolParams): string[] {
    return args.tweets;
}

async function generateTweets(
    openAi: OpenAI,
    presentation: Presentation,
    meetingDate: string
): Promise<Presentation> {
    console.log("Calling OpenAI API to generate tweets for presentation:", presentation.title);
    const result = await openAi.beta.chat.completions
        .runTools({
            model: "gpt-4o",
            tools: [
                zodFunction({
                    function: tweetTool,
                    schema: tweetToolParamsSchema,
                    description:
                        "Call this function to finalize three tweets about the presentation.",
                }),
            ],
            tool_choice: {
                type: "function",
                function: {
                    name: "tweetTool",
                },
            },
            messages: [
                {
                    role: "system",
                    content:
                        sluugDescription +
                        "Please generate three short and enthusiastic tweets that summarize the following presentation to the St. Louis Unix Users Group. Use future-tense. Use the Presenter's full name rather than a nickname or a Twitter handle. Then call the tweetTool to finalize the Tweets.",
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: convertPresentationToPrompt(presentation, true, meetingDate),
                        },
                    ],
                },
            ],
            temperature: 1,
            max_tokens: 256,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        })
        .finalFunctionCallResult();
    if (!result) {
        throw new Error("OpenAI did not call the tool.");
    }
    return { ...presentation, tweet: JSON.parse(result) as string[] };
}

function addLinkToTweets(presentation: Presentation, meetupUrl: string | undefined): Presentation {
    if (!presentation.tweet) {
        throw new Error("Presentation does not contain any tweets");
    }

    if (meetupUrl) {
        return {
            ...presentation,
            tweet: presentation.tweet.map((tweet) => `${tweet} ${meetupUrl}`.trimEnd()),
        };
    }
    // TODO: If meetupUrl is null, put SLUUG/STLLUG Site URL instead
    // Right now site is deployed to placeholder URL.
    // We do not know exactly what the link will be once it is fully deployed
    return {
        ...presentation,
        tweet: presentation.tweet.map((tweet) => `${tweet}`.trimEnd()),
    };
}

/**
 * This function is used to ensure the AI returns YouTube Titles in proper JSON format. As of now, the easiest way to
 * make the OpenAI API return JSON that matches a specific schema is to have it call a function that takes the
 * specific schema as it's parameter. This function only exists to 'force' OpenAI API to return valid JSON.
 *
 * @param args Contains an array of short YouTube Titles for the presentation.
 *             The Params has to be type Object due  to limitation with the OpenAI API.
 * @returns an array of short YouTube Titles for the presentation.
 */
function youTubeTitleTool(args: YouTubeTitleToolParams): string[] {
    return args.titles;
}

function suffixTitleWithMeetingDateAndType(
    generatedTitles: string[],
    meetingDate: string,
    meetingType: MeetingType
): string[] {
    return generatedTitles.map((title) => {
        return `${title} | ${meetingType} ${meetingDate}`;
    });
}

async function generateYouTubeTitleFromPrompt(
    openAi: OpenAI,
    presentationPrompt: string,
    meetingDate: string,
    meetingType: MeetingType
): Promise<string[]> {
    console.log("Calling OpenAI API to generate YouTube Titles.");
    const result = await openAi.beta.chat.completions
        .runTools({
            model: "gpt-4o",
            tools: [
                zodFunction({
                    function: youTubeTitleTool,
                    schema: youTubeTitleToolParamsSchema,
                    description:
                        "Call this function to finalize three titles for the YouTube video of the presentation(s).",
                }),
            ],
            tool_choice: {
                type: "function",
                function: {
                    name: "youTubeTitleTool",
                },
            },
            messages: [
                {
                    role: "system",
                    content:
                        sluugDescription +
                        `The following presentation(s) were given to the St. Louis Linux/Unix Users Group. A video recording of the presentation(s) will be posted to YouTube. Please generate three Titles for the YouTube video. Do not include any hashtags. Then, call the youTubeTitleTool to finalize the titles.`,
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: presentationPrompt,
                        },
                    ],
                },
            ],
            temperature: 1,
            max_tokens: 256,
            top_p: 1,
            frequency_penalty: 0,
            presence_penalty: 0,
        })
        .finalFunctionCallResult();
    if (!result) {
        throw new Error("OpenAI did not call the tool.");
    }
    const generatedTitles = JSON.parse(result) as string[];
    return suffixTitleWithMeetingDateAndType(generatedTitles, meetingDate, meetingType);
}

async function generateImageDesignIdeaFromPrompt(
    openAi: OpenAI,
    presentationPrompt: string
): Promise<string> {
    console.log("Calling OpenAI API to generate a design idea for the image.");
    const result = await openAi.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content:
                    sluugDescription +
                    `The following presentation(s) will be given to the St. Louis Linux/Unix Users Group. Prior to the presentation(s), an announcement will be posted on our blog. To be more engaging the blog should have a large image at the top. The image should not include any words or letters. It should include the logos of the technologies covered in the presentations. The style should be futuristic and technology focused. Generate one design idea for this image.`,
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: presentationPrompt,
                    },
                ],
            },
        ],
        temperature: 1,
        max_tokens: 768,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
    });
    if (!result || !result.choices[0].message.content) {
        throw new Error("OpenAI did not call the tool.");
    }
    return result.choices[0].message.content;
}

function getFileNamePrefix(meetingDate: string, meetingType: MeetingType) {
    return `${meetingDate}_${meetingType.toLowerCase()}`;
}

async function generateImage(
    openAi: OpenAI,
    designIdeas: string[],
    directoryPath: string,
    fileNamePrefix: string
): Promise<Image[]> {
    return Promise.all(
        designIdeas.map(async (design, i) => {
            try {
                console.log(`Calling OpenAI API to generate a image ${i}.`);
                const response = await openAi.images.generate({
                    model: "dall-e-3",
                    prompt: design,
                    n: 1,
                    size: "1792x1024",
                });

                if (!response.data[0] || !response.data[0].url) {
                    throw new Error("No image url returned from OpenAI.");
                }
                const imageUrl = response.data[0].url;

                if (!response.data[0].revised_prompt) {
                    throw new Error("No revised prompt returned from OpenAI.");
                }
                const revisedPrompt = response.data[0].revised_prompt;

                const fileName = `${fileNamePrefix}_${revisedPrompt
                    ?.slice(0, 60)
                    .trimEnd()
                    .replace(/[.,/#!$%^&*'";:{}=_`~()]/g, "")
                    .replaceAll(" ", "-")
                    .toLowerCase()}.png`;
                const generatedImagePath = path.join(directoryPath, fileName);

                // Inside your try block, after downloading the image
                https.get(imageUrl, (response) => {
                    // Use sharp to resize and compress the image
                    const transformer = sharp()
                        .resize(1280, 720) // Resize to 1280x720
                        .png({ quality: 80 }); // Start with a default quality

                    response.pipe(transformer).toBuffer(async (err, buffer, info) => {
                        if (err) throw err;

                        let finalBuffer = buffer;
                        // If the file size is greater than 2MB, adjust the quality
                        if (info.size > 2 * 1024 * 1024) {
                            const qualityForSize = Math.max(10, (2 * 1024 * 1024 * 80) / info.size); // Adjust quality based on initial compression
                            console.warn(
                                "Image size is too large. Adjusting quality to",
                                qualityForSize
                            );
                            finalBuffer = await sharp(buffer)
                                .png({ quality: qualityForSize })
                                .toBuffer();
                        }

                        // Write the final buffer to file
                        await writeFile(generatedImagePath, finalBuffer);
                        console.log(`Image ${i} resized to 1280x720 and saved as ${fileName}`);
                    });
                });
                return { src: `./${fileName}`, alt: revisedPrompt };
            } catch (error) {
                throw new Error(`Error generating image ${i}}:` + error);
            }
        })
    );
}

async function writeMeetingToFile(outputDir: string, outputFileName: string, meeting: Meeting) {
    const outputFilePath = path.join(outputDir, outputFileName);
    try {
        await writeFile(outputFilePath, JSON.stringify(meeting, null, 4)); // Stringify with indentation
        console.log(`JSON object written to file: ${outputFilePath}`);
        console.dir(meeting, { depth: null });
    } catch (error) {
        console.error(`Error writing JSON to file: ${outputFilePath}`);
        throw error;
    }
}

// Main
const isVerbose = process.argv.includes("-v");
const inputFilePath = extractInputFilePathFromArgs();
// const meetingDate = parseMeetingDateFromFileName(inputFilePath); // YYYY-MM-DD
// const meetingType = parseMeetingTypeFromFileName(inputFilePath);
const meetingFromFile = {
    ...(await parseMeetingFile(await openMeetingFile(inputFilePath))),
};
verboseLog("meetingFromFile:");
verboseLog(meetingFromFile);
const apiKey = extractApiKeyFromEnv();
const openAi = new OpenAI({
    apiKey: apiKey,
});

// Add Tags
const meetingWithTags = {
    ...meetingFromFile,
    presentations: await Promise.all(
        meetingFromFile.presentations.map(async (presentation) => {
            const presentationWithGeneratedTags = await generateTags(openAi, presentation);
            return presentationWithGeneratedTags;
        })
    ),
};
verboseLog("meetingWithTags:");
verboseLog(meetingWithTags);

// Add Tweets
const meetingWithTweets = {
    ...meetingWithTags,
    presentations: await Promise.all(
        meetingWithTags.presentations.map(async (presentation) => {
            const presentationWithGeneratedTweets = await generateTweets(
                openAi,
                presentation,
                meetingWithTags.meetingDate
            );
            const presentationWithFinishedTweets = addLinkToTweets(
                presentationWithGeneratedTweets,
                meetingWithTags.meetupUrl
            );
            return presentationWithFinishedTweets;
        })
    ),
};
verboseLog("meetingWithTweets:");
verboseLog(meetingWithTweets);

// Add YouTube Titles
let youTubeTitles: string[] = [];
// If this is a meeting with a single presentation (STLLUG), generate three YouTube Titles for that presentation.
if (meetingWithTweets.presentations.length === 1) {
    for (let i = 0; i < 3; i++) {
        youTubeTitles = youTubeTitles.concat(
            await generateYouTubeTitleFromPrompt(
                openAi,
                // The zod schema specifies that at least one meeting should be passed in, so calling [0] index is safe.
                convertPresentationToPrompt(meetingWithTweets.presentations[0]),
                meetingWithTweets.meetingDate,
                meetingWithTweets.meetingType
            )
        );
    }
} else {
    // If this is a meeting with multiple presentations (SLUUG), generate YouTube Titles for each presentation.
    const titles = await Promise.all(
        meetingWithTweets.presentations.map(async (presentation) => {
            return await generateYouTubeTitleFromPrompt(
                openAi,
                convertPresentationToPrompt(presentation),
                meetingWithTweets.meetingDate,
                meetingWithTweets.meetingType
            );
        })
    );
    youTubeTitles = youTubeTitles.concat(titles.flat());
    // And generate YouTube Titles for all presentations combined.
    youTubeTitles = youTubeTitles.concat(
        await generateYouTubeTitleFromPrompt(
            openAi,
            convertPresentationsToPrompt(meetingWithTweets.presentations),
            meetingWithTweets.meetingDate,
            meetingWithTweets.meetingType
        )
    );
}
const meetingWithYouTubeTitles = {
    ...meetingWithTweets,
    youTubeTitle: youTubeTitles,
};
verboseLog("meetingWithYouTubeTitles:");
verboseLog(meetingWithYouTubeTitles);

// // Add Images
let designIdeas: string[] = [];
// If this is a meeting with a single presentation (STLLUG), generate three design ideas for that presentation.
if (meetingWithYouTubeTitles.presentations.length === 1) {
    for (let i = 0; i < 3; i++) {
        designIdeas.push(
            await generateImageDesignIdeaFromPrompt(
                openAi,
                convertPresentationToPrompt(meetingWithYouTubeTitles.presentations[0])
            )
        );
    }
} else {
    // If this is a meeting with multiple presentations (SLUUG), generate one design idea for each presentation.
    designIdeas = designIdeas.concat(
        await Promise.all(
            meetingWithYouTubeTitles.presentations.map(async (presentation) => {
                return await generateImageDesignIdeaFromPrompt(
                    openAi,
                    convertPresentationToPrompt(presentation)
                );
            })
        )
    );
    // And generate one design idea for all presentations combined.
    designIdeas.push(
        await generateImageDesignIdeaFromPrompt(
            openAi,
            convertPresentationsToPrompt(meetingWithYouTubeTitles.presentations)
        )
    );
}
verboseLog("designIdeas:", designIdeas);
const fileNamePrefix = getFileNamePrefix(
    meetingWithYouTubeTitles.meetingDate,
    meetingWithYouTubeTitles.meetingType
);
const outputDir = resolve(dirname(fileURLToPath(import.meta.url)), ".."); // import.meta.url is /dist/src, using ".." goes up a directory to /dist
const meetingWithImages = {
    ...meetingWithYouTubeTitles,
    image: await generateImage(openAi, designIdeas, outputDir, fileNamePrefix),
};

verboseLog("meetingWithImages:");
verboseLog(meetingWithImages);

await writeMeetingToFile(outputDir, `${fileNamePrefix}.json`, meetingWithImages);
