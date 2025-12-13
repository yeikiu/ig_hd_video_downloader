const path = require('path');
const webpack = require('webpack');

const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const BuildExtensionPlugin = require('./src/build');

const webpackConfig = {
    node: {
        global: false,
    },
    entry: {
        extension: "/src/ts/index.ts",
        background: "/src/ts/background/BackgroundMessageHandler.ts",
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.scss$/,
                use: [
                    // Extract and save the final CSS.
                    MiniCssExtractPlugin.loader,
                    // Load the CSS, set url = false to prevent following urls to fonts and images.
                    {loader: "css-loader", options: {url: false, importLoaders: 1}},
                    // Load the SCSS/SASS
                    {
                        loader: 'sass-loader',
                        options: {
                            api: 'modern-compiler',
                            sassOptions: {
                                silenceDeprecations: ['legacy-js-api']
                            }
                        }
                    },
                ],
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        filename: 'js/[name].js',
        path: path.resolve(__dirname, 'dist'),
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: 'css/[name].css',
            chunkFilename: '[id].css',
        }),
        new HtmlWebpackPlugin({
            template: 'src/options/options.html',
            filename: "options.html",
            excludeChunks: ["extension", "background"],
        }),
        new webpack.ProvidePlugin({
            global: require.resolve('./src/global.js'),
        }),
        new BuildExtensionPlugin(),
    ],
};


module.exports = (env, argv) => {
    webpackConfig.devtool = 'inline-source-map';
    if (argv.mode === "production") {
        webpackConfig.plugins.push(
            new webpack.DefinePlugin({
                PRODUCTION: JSON.stringify(true),
            }),
        );
    } else {
        webpackConfig.plugins.push(
            new webpack.DefinePlugin({
                PRODUCTION: JSON.stringify(false),
            }),
        );
    }
    return webpackConfig;
};
