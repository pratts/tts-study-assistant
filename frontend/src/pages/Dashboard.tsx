import React, { useEffect, useState } from 'react';
import { Box, Heading, SimpleGrid, Stat, StatLabel, StatNumber, Table, Thead, Tbody, Tr, Th, Td, IconButton, Text, Spinner, Alert, AlertIcon } from '@chakra-ui/react';
import { FaVolumeUp, FaPause } from 'react-icons/fa';
import { getNotesStats, getNotes } from '../api/apiClient';

export default function Dashboard() {
  const [stats, setStats] = useState<{ domain: string; count: number }[]>([]);
  const [mostRecent, setMostRecent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError('');
      try {
        const statsData = await getNotesStats();
        setStats(statsData);
        const notes = await getNotes({ page: 1, page_size: 1 });
        setMostRecent(notes[0] || null);
      } catch (e: any) {
        setError(e.message || 'Failed to load dashboard');
      }
      setLoading(false);
    }
    fetchData();
  }, []);

  function getDisplayDomain(domain: string) {
    if (domain === 'mhjfbmdgcfjbbpaeojofohoefgiehjai' || domain === 'local-file') {
      return 'Downloaded/Local file';
    }
    return domain;
  }

  return (
    <Box>
      <Heading size="lg" mb={6}>Dashboard</Heading>
      {loading && <Spinner size="lg" />}
      {error && <Alert status="error" mb={4}><AlertIcon />{error}</Alert>}
      {!loading && !error && (
        <>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={8} mb={8}>
            <Stat p={6} bg="white" borderRadius="md" boxShadow="sm">
              <StatLabel>Total Notes</StatLabel>
              <StatNumber>{stats.reduce((sum, s) => sum + s.count, 0)}</StatNumber>
            </Stat>
            <Box p={6} bg="white" borderRadius="md" boxShadow="sm">
              <Text fontWeight="bold" mb={2}>Most Recent Note</Text>
              {mostRecent ? (
                <>
                  <Text mb={2}>{mostRecent.content}</Text>
                  <Text fontSize="sm" color="gray.500">{getDisplayDomain(mostRecent.domain)}</Text>
                  <IconButton
                    aria-label="Play note"
                    icon={<FaVolumeUp />}
                    mt={2}
                    colorScheme="blue"
                    onClick={() => window.speechSynthesis.speak(new SpeechSynthesisUtterance(mostRecent.content))}
                  />
                  <IconButton
                    aria-label="Pause note"
                    icon={<FaPause />}
                    mt={2}
                    colorScheme="gray"
                    ml={2}
                    onClick={() => window.speechSynthesis.cancel()}
                  />
                </>
              ) : <Text>No notes found.</Text>}
            </Box>
          </SimpleGrid>
          <Box bg="white" borderRadius="md" boxShadow="sm" p={6}>
            <Text fontWeight="bold" mb={4}>Domain-wise Notes</Text>
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>Domain</Th>
                  <Th>Notes Count</Th>
                </Tr>
              </Thead>
              <Tbody>
                {stats.map(ds => (
                  <Tr key={ds.domain}>
                    <Td>{getDisplayDomain(ds.domain)}</Td>
                    <Td>{ds.count}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {stats.length === 0 && <Text mt={4}>No notes found.</Text>}
          </Box>
        </>
      )}
    </Box>
  );
} 