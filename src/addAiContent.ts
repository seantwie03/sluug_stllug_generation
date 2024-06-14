import { FileHandle, open, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path, { dirname, resolve } from "node:path";
import { argv } from "node:process";
import OpenAI from "openai";
import {
    Image,
    ImageDesignsToolParams,
    Meeting,
    MeetingType,
    Presentation,
    TagToolParams,
    TweetToolParams,
    YouTubeTitleToolParams,
    imageDesignsToolParamsSchema,
    meetingSchema,
    tagToolParamsSchema,
    tweetToolParamsSchema,
    youTubeTitleToolParamsSchema,
    zodFunctionVoid,
} from "./models.js";
import { sluugDescription } from "./constants.js";
import { createWriteStream } from "node:fs";
import https from "node:https";

function extractInputFilePathFromArgs(): string {
    if (argv.length < 3) {
        throw new Error(
            "No file path provided. You must supply the path to a JSON file as an argument."
        );
    }
    return argv[2];
}

function parseMeetingDateFromFileName(filePath: string): Date {
    const fileName = path.basename(filePath);
    const datePart = fileName.slice(0, 10);
    const timestamp = Date.parse(datePart);
    if (isNaN(timestamp)) {
        throw new Error(
            "Invalid date format in file name. The JSON file name must start with a date in this format YYYY-MM-DD."
        );
    }
    return new Date(timestamp);
}

function parseMeetingTypeFromFileName(filePath: string): MeetingType {
    const fileName = path.basename(filePath);
    if (fileName.endsWith("sluug.json")) {
        return "SLUUG";
    }
    if (fileName.endsWith("stllug.json")) {
        return "STLLUG";
    }
    throw new Error(
        'Invalid file name. The file name must end with "sluug.json" or "stllug.json".'
    );
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
        console.error(`Error reading or parsing JSON Meeting file: ${filePath}`);
        throw error;
    }
}

async function parseMeetingFile(file: FileHandle, meetingDate: Date): Promise<Meeting> {
    const jsonBuffer = await file.readFile();
    try {
        return { ...meetingSchema.parse(JSON.parse(jsonBuffer.toString())), meetingDate };
    } catch (error) {
        console.error(`Error parsing JSON Meeting file: ${inputFilePath}`);
        throw error;
    } finally {
        file.close();
    }
}

function convertPresentationToPrompt(presentation: Presentation): string {
    return `The title of the presentation is: ${presentation.title}.
    The presenter(s) are: ${presentation.presenterNames.join()}.
    This presentation abstract is as follows: ${presentation.abstract}
    ${presentation.tags ? `Tags: ${presentation.tags.join()}` : ""}`;
}

function convertPresentationsToPrompt(presentations: Presentation[]): string {
    return presentations
        .map((presentation) => convertPresentationToPrompt(presentation))
        .join("\n");
}

function convertPresentationToPromptWithMeetingDate(
    presentation: Presentation,
    meetingDate: Date
): string {
    return `This presentation will be given on: ${meetingDate.toISOString().slice(0, 10)}.
    The title of the presentation is: ${presentation.title}.
    The presenter(s) are: ${presentation.presenterNames.join()}.
    This presentation abstract is as follows: ${presentation.abstract}
    ${presentation.tags ? `Tags: ${presentation.tags.join()}` : ""}`;
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
    return args.tags.map((tag) => tag.replace(" ", "-").toLowerCase());
}

async function generateTags(openAi: OpenAI, presentation: Presentation): Promise<Presentation> {
    const result = await openAi.beta.chat.completions
        .runTools({
            model: "gpt-4o",
            tools: [
                zodFunctionVoid({
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
    meetingDate: Date
): Promise<Presentation> {
    const result = await openAi.beta.chat.completions
        .runTools({
            model: "gpt-4o",
            tools: [
                zodFunctionVoid({
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
                            text: convertPresentationToPromptWithMeetingDate(
                                presentation,
                                meetingDate
                            ),
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
    return { ...presentation, tweets: JSON.parse(result) as string[] };
}

function addLinkToTweets(presentation: Presentation, meetupUrl: string | undefined): Presentation {
    if (!presentation.tweets) {
        throw new Error("Presentation does not contain any tweets");
    }
    // TODO: If meetupUrl is null, put SLUUG Site URL instead.
    return {
        ...presentation,
        tweets: presentation.tweets.map((tweet) => `${tweet} ${meetupUrl}`.trimEnd()),
    };
}

/**
 * This function is used to ensure the AI returns YouTube Titles in proper JSON format. As of now, the easiest way to
 * make the OpenAI API return JSON that matches a specific schema is to have it call a function that takes the
 * specific schema as it's parameter. This function only exists to 'force' OpenAI API to return valid JSON.
 *
 * @param args Contains an array of short and enthusiastic YouTube Titles that summarize the presentation.
 *             The Params has to be type Object due  to limitation with the OpenAI API.
 * @returns an array of short and enthusiastic YouTube Titles that summarize the presentation.
 */
function youTubeTitleTool(args: YouTubeTitleToolParams): string[] {
    return args.titles;
}

function addMeetingDateAndType(
    generatedTitles: string[],
    meetingDate: Date,
    meetingType: MeetingType
): string[] {
    return generatedTitles.map((title) => {
        return `${meetingType} ${meetingDate.toISOString().slice(0, 10)} - ${title}`;
    });
}

async function generateYouTubeTitles(openAi: OpenAI, meeting: Meeting): Promise<Meeting> {
    const result = await openAi.beta.chat.completions
        .runTools({
            model: "gpt-4o",
            tools: [
                zodFunctionVoid({
                    function: youTubeTitleTool,
                    schema: youTubeTitleToolParamsSchema,
                    description:
                        "Call this function to finalize three titles for the YouTube video of this presentation.",
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
                        `The following presentation was given to the St. Louis Linux/Unix Users Group. A video recording of the presentation will be posted to YouTube. Please generate three very short Titles for the YouTube video. Do not include any hashtags. Then, call the youTubeTitleTool to finalize the titles.`,
                },
                {
                    role: "user",
                    // Most time the BASE and MAIN presentations have nothing in common. This makes it nearly impossible
                    // to come up with a YouTube title that includes both. Instead, have the YouTube title be only
                    // about the MAIN presentation.
                    // The Zod schema specifies a minimum of 1 presentation, so calling [0] index is safe.
                    content: [
                        {
                            type: "text",
                            text: convertPresentationToPrompt(meeting.presentations[0]),
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
    return {
        ...meeting,
        youtubeTitles: addMeetingDateAndType(generatedTitles, meetingDate, meetingType),
    };
}

async function generateImageDesignIdeaFromPrompt(
    openAi: OpenAI,
    presentationPrompt: string
): Promise<string> {
    const result = await openAi.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content:
                    sluugDescription +
                    `The following presentation will be given to the St. Louis Linux/Unix Users Group. Prior to the presentation, an announcement will be posted on our blog. To be more engaging the blog should have a large image at the top. The image should not include any words or letters. It should include the logos of the technologies covered in the presentation. The style should be futuristic and technology focused. Generate one design idea for this image.`,
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

// /**
//  * This function is used to ensure the AI returns design ideas in proper JSON format. As of now, the easiest way to
//  * make the OpenAI API return JSON that matches a specific schema is to have it call a function that takes the
//  * specific schema as it's parameter. This function only exists to 'force' OpenAI API to return valid JSON.
//  *
//  * @param args Contains an array of design ideas for the presentation.
//  *             The Params has to be type Object due  to limitation with the OpenAI API.
//  * @returns an array of design ideas for the presentation.
//  */
// function imageDesignsGenerationTool(args: ImageDesignsToolParams): string[] {
//     return args.designs;
// }
//
// async function generateImageDesignIdeas(openAi: OpenAI, meeting: Meeting): Promise<string[]> {
//     const result = await openAi.beta.chat.completions
//         .runTools({
//             model: "gpt-4o",
//             tools: [
//                 zodFunctionVoid({
//                     function: imageDesignsGenerationTool,
//                     schema: imageDesignsToolParamsSchema,
//                     description:
//                         "Call this function to to generate the images from the design ideas.",
//                 }),
//             ],
//             tool_choice: {
//                 type: "function",
//                 function: {
//                     name: "imageDesignsGenerationTool",
//                 },
//             },
//             messages: [
//                 {
//                     role: "system",
//                     content:
//                         sluugDescription +
//                         `The following presentation will be given to the St. Louis Linux/Unix Users Group. Prior to the presentation, an announcement will be posted on our blog. To be more engaging the blog should have a large image at the top. The image should not include any words or letters. It should include the logos of the technologies covered in the presentation. The style should be futuristic and technology focused. Generate three design ideas for this image. Then, call the imagesGenerationTool to generate the images.`,
//                 },
//                 {
//                     role: "user",
//                     content: [
//                         {
//                             type: "text",
//                             text: `The title of the presentation is: ${
//                                 meeting.presentations[0].title
//                             }.
//                                 The presenter(s) are: ${meeting.presentations[0].presenterNames.join()}.
//                                 This presentation abstract is as follows: ${
//                                     meeting.presentations[0].abstract
//                                 }`,
//                         },
//                     ],
//                 },
//             ],
//             temperature: 1,
//             max_tokens: 256,
//             top_p: 1,
//             frequency_penalty: 0,
//             presence_penalty: 0,
//         })
//         .finalFunctionCallResult();
//     if (!result) {
//         throw new Error("OpenAI did not call the tool.");
//     }
//     return JSON.parse(result) as string[];
// }

async function generateImage(
    openAi: OpenAI,
    designIdeas: string[],
    directoryPath: string,
    fileNamePrefix: string
): Promise<Image[]> {
    return Promise.all(
        await designIdeas.map(async (design, i) => {
            try {
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
                    .replace(/[.,\/#!$%\^&\*'";:{}=_`~()]/g, "")
                    .replaceAll(" ", "-")
                    .toLowerCase()}.png`;

                const generatedImagePath = path.join(directoryPath, fileName);

                const file = createWriteStream(generatedImagePath);

                https.get(imageUrl, (response) => {
                    response.pipe(file);
                });

                console.log(`Image ${i} saved at ${generatedImagePath}`);
                return { src: `./${fileName}`, alt: revisedPrompt };
            } catch (error) {
                throw new Error(`Error generating image ${i}}:` + error);
            }
        })
    );
}

function getFileNamePrefix(meetingDate: Date, meetingType: MeetingType) {
    if (meetingType === "SLUUG") {
        return `${meetingDate.toISOString().slice(0, 10)}_sluug`;
    } else {
        return `${meetingDate.toISOString().slice(0, 10)}_stllug`;
    }
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

const inputFilePath = extractInputFilePathFromArgs();
const meetingDate = parseMeetingDateFromFileName(inputFilePath);
const meetingType = parseMeetingTypeFromFileName(inputFilePath);
const meetingFromFile = await parseMeetingFile(await openMeetingFile(inputFilePath), meetingDate);
console.log("meetingFromFile:");
console.dir(meetingFromFile, { depth: null });
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
console.log("meetingWithTags:");
console.dir(meetingWithTags, { depth: null });

// Add Tweets
const meetingWithTweets = {
    ...meetingWithTags,
    presentations: await Promise.all(
        meetingWithTags.presentations.map(async (presentation) => {
            const presentationWithGeneratedTweets = await generateTweets(
                openAi,
                presentation,
                meetingDate
            );
            const presentationWithFinishedTweets = addLinkToTweets(
                presentationWithGeneratedTweets,
                meetingWithTags.meetupUrl
            );
            return presentationWithFinishedTweets;
        })
    ),
};
console.log("meetingWithTweets:");
console.dir(meetingWithTweets, { depth: null });

// Add YouTube Titles
const meetingWithYouTubeTitles = await generateYouTubeTitles(openAi, meetingWithTweets);
console.log("meetingWithYouTubeTitles:");
console.dir(meetingWithYouTubeTitles, { depth: null });

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
console.log("designIdeas:", designIdeas);
const fileNamePrefix = getFileNamePrefix(meetingDate, meetingType);
const outputDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const meetingWithImages = {
    ...meetingWithYouTubeTitles,
    image: await generateImage(openAi, designIdeas, outputDir, fileNamePrefix),
};

console.log("meetingWithImages:");
console.dir(meetingWithImages, { depth: null });

// Save the updated meeting to the file
await writeMeetingToFile(outputDir, `${fileNamePrefix}.json`, meetingWithImages);
