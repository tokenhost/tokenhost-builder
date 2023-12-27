//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.2;
pragma experimental ABIEncoderV2;

contract FilComments_contract {
    uint256 timestamp;
    address sender;
    string comment;
    string photo;
    address topic;

    constructor(
        string memory _comment,
        string memory _photo,
        address _topic
    ) {
        sender = tx.origin;
        timestamp = block.timestamp;
        comment = _comment;
        photo = _photo;
        topic = _topic;
    }

    function getall()
        public
        view
        returns (
            address,
            uint256,
            address,
            string memory,
            string memory,
            address
        )
    {
        return (address(this), timestamp, sender, comment, photo, topic);
    }

    function get_timestamp() public view returns (uint256) {
        return timestamp;
    }

    function get_sender() public view returns (address) {
        return sender;
    }

    function get_comment() public view returns (string memory) {
        return comment;
    }

    function get_photo() public view returns (string memory) {
        return photo;
    }

    function get_topic() public view returns (address) {
        return topic;
    }
}

contract Topics_contract {
    uint256 timestamp;
    address sender;
    string name;

    constructor(string memory _name) {
        sender = tx.origin;
        timestamp = block.timestamp;
        name = _name;
    }

    function getall()
        public
        view
        returns (
            address,
            uint256,
            address,
            string memory
        )
    {
        return (address(this), timestamp, sender, name);
    }

    function get_timestamp() public view returns (uint256) {
        return timestamp;
    }

    function get_sender() public view returns (address) {
        return sender;
    }

    function get_name() public view returns (string memory) {
        return name;
    }
}

contract App {
    address[] FilComments_list;
    uint256 FilComments_list_length;

    function get_FilComments_list_length() public view returns (uint256) {
        return FilComments_list_length;
    }

    struct FilComments_getter {
        address _address;
        uint256 timestamp;
        address sender;
        string comment;
        string photo;
        address topic;
    }

    function get_FilComments_N(uint256 index)
        public
        view
        returns (
            address,
            uint256,
            address,
            string memory,
            string memory,
            address
        )
    {
        return FilComments_contract(FilComments_list[index]).getall();
    }

    function get_first_FilComments_N(uint256 count, uint256 offset)
        public
        view
        returns (FilComments_getter[] memory)
    {
        FilComments_getter[] memory getters = new FilComments_getter[](count);
        for (uint256 i = offset; i < count; i++) {
            FilComments_contract myFilComments =
                FilComments_contract(FilComments_list[i + offset]);
            getters[i - offset]._address = address(myFilComments);
            getters[i - offset].timestamp = myFilComments.get_timestamp();
            getters[i - offset].sender = myFilComments.get_sender();
            getters[i - offset].comment = myFilComments.get_comment();
            getters[i - offset].photo = myFilComments.get_photo();
            getters[i - offset].topic = myFilComments.get_topic();
        }
        return getters;
    }

    function get_last_FilComments_N(uint256 count, uint256 offset)
        public
        view
        returns (FilComments_getter[] memory)
    {
        FilComments_getter[] memory getters = new FilComments_getter[](count);
        for (uint256 i = 0; i < count; i++) {
            FilComments_contract myFilComments =
                FilComments_contract(
                    FilComments_list[FilComments_list_length - i - offset - 1]
                );
            getters[i]._address = address(myFilComments);

            getters[i].timestamp = myFilComments.get_timestamp();
            getters[i].sender = myFilComments.get_sender();
            getters[i].comment = myFilComments.get_comment();
            getters[i].photo = myFilComments.get_photo();
            getters[i].topic = myFilComments.get_topic();
        }
        return getters;
    }

    function get_FilComments_user_length(address user)
        public
        view
        returns (uint256)
    {
        return user_map[user].FilComments_list_length;
    }

    function get_FilComments_user_N(address user, uint256 index)
        public
        view
        returns (
            address,
            uint256,
            address,
            string memory,
            string memory,
            address
        )
    {
        return
            FilComments_contract(user_map[user].FilComments_list[index])
                .getall();
    }

    function get_last_FilComments_user_N(
        address user,
        uint256 count,
        uint256 offset
    ) public view returns (FilComments_getter[] memory) {
        FilComments_getter[] memory getters = new FilComments_getter[](count);

        for (uint256 i = offset; i < count; i++) {
            getters[i - offset]._address = user_map[user].FilComments_list[
                i + offset
            ];
            getters[i - offset].timestamp = FilComments_contract(
                user_map[user].FilComments_list[i + offset]
            )
                .get_timestamp();
            getters[i - offset].sender = FilComments_contract(
                user_map[user].FilComments_list[i + offset]
            )
                .get_sender();
            getters[i - offset].comment = FilComments_contract(
                user_map[user].FilComments_list[i + offset]
            )
                .get_comment();
            getters[i - offset].photo = FilComments_contract(
                user_map[user].FilComments_list[i + offset]
            )
                .get_photo();
            getters[i - offset].topic = FilComments_contract(
                user_map[user].FilComments_list[i + offset]
            )
                .get_topic();
        }
        return getters;
    }

    address[] Topics_list;
    uint256 Topics_list_length;

    function get_Topics_list_length() public view returns (uint256) {
        return Topics_list_length;
    }

    struct Topics_getter {
        address _address;
        uint256 timestamp;
        address sender;
        string name;
    }

    function get_Topics_N(uint256 index)
        public
        view
        returns (
            address,
            uint256,
            address,
            string memory
        )
    {
        return Topics_contract(Topics_list[index]).getall();
    }

    function get_first_Topics_N(uint256 count, uint256 offset)
        public
        view
        returns (Topics_getter[] memory)
    {
        Topics_getter[] memory getters = new Topics_getter[](count);
        for (uint256 i = offset; i < count; i++) {
            Topics_contract myTopics = Topics_contract(Topics_list[i + offset]);
            getters[i - offset]._address = address(myTopics);
            getters[i - offset].timestamp = myTopics.get_timestamp();
            getters[i - offset].sender = myTopics.get_sender();
            getters[i - offset].name = myTopics.get_name();
        }
        return getters;
    }

    function get_last_Topics_N(uint256 count, uint256 offset)
        public
        view
        returns (Topics_getter[] memory)
    {
        Topics_getter[] memory getters = new Topics_getter[](count);
        for (uint256 i = 0; i < count; i++) {
            Topics_contract myTopics =
                Topics_contract(
                    Topics_list[Topics_list_length - i - offset - 1]
                );
            getters[i]._address = address(myTopics);

            getters[i].timestamp = myTopics.get_timestamp();
            getters[i].sender = myTopics.get_sender();
            getters[i].name = myTopics.get_name();
        }
        return getters;
    }

    function get_Topics_user_length(address user)
        public
        view
        returns (uint256)
    {
        return user_map[user].Topics_list_length;
    }

    function get_Topics_user_N(address user, uint256 index)
        public
        view
        returns (
            address,
            uint256,
            address,
            string memory
        )
    {
        return Topics_contract(user_map[user].Topics_list[index]).getall();
    }

    function get_last_Topics_user_N(
        address user,
        uint256 count,
        uint256 offset
    ) public view returns (Topics_getter[] memory) {
        Topics_getter[] memory getters = new Topics_getter[](count);

        for (uint256 i = offset; i < count; i++) {
            getters[i - offset]._address = user_map[user].Topics_list[
                i + offset
            ];
            getters[i - offset].timestamp = Topics_contract(
                user_map[user].Topics_list[i + offset]
            )
                .get_timestamp();
            getters[i - offset].sender = Topics_contract(
                user_map[user].Topics_list[i + offset]
            )
                .get_sender();
            getters[i - offset].name = Topics_contract(
                user_map[user].Topics_list[i + offset]
            )
                .get_name();
        }
        return getters;
    }

    struct FilComments_Topics {
        bool exists;
        address[] FilComments_list;
    }
    mapping(address => FilComments_Topics) public FilComments_Topics_map;

    function get_length_FilComments_Topics_map(address hash)
        public
        view
        returns (uint256)
    {
        return FilComments_Topics_map[hash].FilComments_list.length;
    }

    function get_last_FilComments_Topics_map_N(
        address hash,
        uint256 count,
        uint256 offset
    ) public view returns (FilComments_getter[] memory) {
        FilComments_getter[] memory getters = new FilComments_getter[](count);
        for (uint256 i = 0; i < count; i++) {
            FilComments_contract myFilComments =
                FilComments_contract(
                    FilComments_Topics_map[hash].FilComments_list[
                        FilComments_Topics_map[hash].FilComments_list.length -
                            i -
                            offset -
                            1
                    ]
                );

            getters[i]._address = address(myFilComments);

            getters[i].timestamp = myFilComments.get_timestamp();
            getters[i].sender = myFilComments.get_sender();
            getters[i].comment = myFilComments.get_comment();
            getters[i].photo = myFilComments.get_photo();
            getters[i].topic = myFilComments.get_topic();
        }
        return getters;
    }

    struct UserInfo {
        address owner;
        bool exists;
        address[] FilComments_list;
        uint256 FilComments_list_length;
        address[] Topics_list;
        uint256 Topics_list_length;
    }
    mapping(address => UserInfo) public user_map;
    address[] UserInfoList;
    uint256 UserInfoListLength;

    event NewFilComments(address sender);

    function new_FilComments(
        string memory comment,
        string memory photo,
        address topic
    ) public returns (address) {
        address mynew =
            address(
                new FilComments_contract({
                    _comment: comment,
                    _photo: photo,
                    _topic: topic
                })
            );

        if (!FilComments_Topics_map[topic].exists) {
            FilComments_Topics_map[
                topic
            ] = create_index_on_new_FilComments_Topics();
        }
        FilComments_Topics_map[topic].FilComments_list.push(mynew);

        if (!user_map[tx.origin].exists) {
            user_map[tx.origin] = create_user_on_new_FilComments(mynew);
        }
        user_map[tx.origin].FilComments_list.push(mynew);

        user_map[tx.origin].FilComments_list_length += 1;

        FilComments_list.push(mynew);
        FilComments_list_length += 1;

        emit NewFilComments(tx.origin);

        return mynew;
    }

    function create_user_on_new_FilComments(address addr)
        private
        returns (UserInfo memory)
    {
        address[] memory FilComments_list_;

        address[] memory Topics_list_;

        UserInfoList.push(addr);
        return
            UserInfo({
                exists: true,
                owner: addr,
                FilComments_list: FilComments_list_,
                FilComments_list_length: 0,
                Topics_list: Topics_list_,
                Topics_list_length: 0
            });
    }

    function create_index_on_new_FilComments_Topics()
        private
        pure
        returns (FilComments_Topics memory)
    {
        address[] memory tmp;
        return FilComments_Topics({exists: true, FilComments_list: tmp});
    }

    event NewTopics(address sender);

    mapping(bytes32 => address) unique_map_Topics;

    function get_unique_map_Topics(string memory name)
        public
        view
        returns (address)
    {
        bytes32 hash_Topics = keccak256(abi.encodePacked(name));
        return unique_map_Topics[hash_Topics];
    }

    function new_Topics(string memory name) public returns (address) {
        bytes32 hash_Topics = keccak256(abi.encodePacked(name));

        require(unique_map_Topics[hash_Topics] == address(0));

        address mynew = address(new Topics_contract({_name: name}));
        unique_map_Topics[hash_Topics] = mynew;

        if (!user_map[tx.origin].exists) {
            user_map[tx.origin] = create_user_on_new_Topics(mynew);
        }
        user_map[tx.origin].Topics_list.push(mynew);

        user_map[tx.origin].Topics_list_length += 1;

        Topics_list.push(mynew);
        Topics_list_length += 1;

        emit NewTopics(tx.origin);

        return mynew;
    }

    function create_user_on_new_Topics(address addr)
        private
        returns (UserInfo memory)
    {
        address[] memory FilComments_list_;

        address[] memory Topics_list_;

        UserInfoList.push(addr);
        return
            UserInfo({
                exists: true,
                owner: addr,
                FilComments_list: FilComments_list_,
                FilComments_list_length: 0,
                Topics_list: Topics_list_,
                Topics_list_length: 0
            });
    }
}
