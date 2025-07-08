import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
    colors: {
        brand: {
            50: '#e0e7ff',
            100: '#c7d2fe',
            200: '#a5b4fc',
            300: '#818cf8',
            400: '#6366f1',
            500: '#4f46e5', // plugin secondary
            600: '#2563eb', // plugin primary
            700: '#1d4ed8',
            800: '#1e40af',
            900: '#1e3a8a',
        },
    },
    styles: {
        global: {
            body: {
                bg: '#f9fafb',
                color: '#1f2937',
            },
        },
    },
});

export default theme; 